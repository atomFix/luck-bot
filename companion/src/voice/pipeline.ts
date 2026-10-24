import { currentJournal } from "../ledger/journal.js";
import { performance } from "node:perf_hooks";
import type {
  Brain,
  DeviceClient,
  Asr,
  Tts,
  AudioOutput,
  Turn,
  Message,
  EventMeta,
} from "../contracts.js";
import { TurnManager } from "./turn.js";
import { History } from "./history.js";
import { wav16k } from "./utterance.js";
type Options = {
  brain: Brain;
  device: DeviceClient;
  asr: Asr;
  tts: Tts;
  output: AudioOutput;
  diagnose?: (meta: EventMeta) => void;
  onReply?: (text: string) => void;
};
export class VoicePipeline {
  private turns = new TurnManager();
  private history = new History();
  private speakerHistory = new Map<string, History>();
  constructor(private options: Options) {}
  async interrupt() {
    const old = this.turns.number;
    this.turns.cancel();
    if (old) {
      await Promise.allSettled([
        this.options.device.cancel(old),
        this.options.output.cancel(old),
      ]);
    }
  }
  clearHistory() {
    this.history.clear();
    this.speakerHistory.clear();
  }
  clearSpeaker(id: string) {
    this.speakerHistory.delete(id);
  }
  async expression(pcm: Uint8Array, id: number, speaker: string, beforeApply?: (signal:AbortSignal)=>Promise<void>) {
    const turn = await this.begin(id);
    const t = performance.now();
    const text = await this.options.asr.transcribe(wav16k(pcm), turn.signal);
    this.check(turn);
    this.event("asr.done", turn, t);
    currentJournal()?.patch({ user_text: text || null, device_turn: turn.id });
    if (!text.trim()) return;
    let history = this.speakerHistory.get(speaker);
    if (!history) {
      if (this.speakerHistory.size >= 10)
        this.speakerHistory.delete(this.speakerHistory.keys().next().value!);
      history = new History();
      this.speakerHistory.set(speaker, history);
    }
    const start = performance.now();
    const predicted = await this.options.brain.reaction(
      text,
      history.snapshot(),
      turn.signal,
    );
    const reaction={...predicted,hold_ms:Math.max(2500,predicted.hold_ms)};
    this.check(turn);
    this.event("reaction.ready", turn, start);
    currentJournal()?.patch({
      emotion: reaction.emotion,
      hold_ms: reaction.hold_ms,
    });
    const waiting=performance.now();
    await beforeApply?.(turn.signal);
    this.check(turn);
    if(performance.now()-waiting>=1)this.event("reaction.display_wait",turn,waiting);
    const applied = performance.now();
    await this.options.device.react(reaction, turn, "voice");
    this.check(turn);
    this.event("reaction.applied", turn, applied);
    history.add(text, "表情：" + reaction.emotion);
    return reaction;
  }

  private async begin(id?: number) {
    const old = this.turns.number;
    const turn = this.turns.start(id);
    if (old)
      await Promise.allSettled([
        this.options.device.cancel(old),
        this.options.output.cancel(old),
      ]);
    this.check(turn);
    return turn;
  }
  private check(turn: Turn) {
    turn.signal.throwIfAborted();
    if (!this.turns.isCurrent(turn)) throw new Error("stale");
  }
  async text(
    text: string,
    options: {
      turn?: number;
      speak?: boolean;
      source?: "voice" | "agent";
    } = {},
  ) {
    if (!text.trim() || text.length > 4000) throw new Error("text_size");
    const turn = await this.begin(options.turn);
    return this.process(
      text.trim(),
      turn,
      options.speak !== false,
      options.source ?? "voice",
    );
  }
  async audio(pcm: Uint8Array, externalTurn?: number) {
    const turn = await this.begin(externalTurn);
    const t = performance.now();
    const text = await this.options.asr.transcribe(wav16k(pcm), turn.signal);
    this.check(turn);
    this.event("asr.done", turn, t);
    currentJournal()?.patch({ user_text: text || null });
    if (text.trim()) return this.process(text, turn, true);
    return "";
  }
  private event(event: string, turn: Turn, start: number) {
    this.options.diagnose?.({
      event,
      turn: turn.id,
      duration_ms: Math.round(performance.now() - start),
    });
  }
  private async process(
    text: string,
    turn: Turn,
    speak: boolean,
    source: "voice" | "agent" = "voice",
  ): Promise<string> {
    const started = performance.now();
    let firstAudio = true;
    currentJournal()?.patch({ device_turn: turn.id });
    const history = this.history.snapshot();
    let began = performance.now();
    const reaction = await this.options.brain.reaction(
      text,
      history,
      turn.signal,
    );
    this.check(turn);
    this.event("reaction.ready", turn, began);
    currentJournal()?.patch({
      emotion: reaction.emotion,
      hold_ms: reaction.hold_ms,
    });
    began = performance.now();
    await this.options.device.react(reaction, turn, source);
    this.check(turn);
    this.event("reaction.applied", turn, began);
    let reply = "",
      sentence = "",
      first = true;
    began = performance.now();
    const say = async (value: string) => {
      if (!speak || !value.trim()) return;
      const ttsStarted = performance.now();
      for await (const pcm of this.options.tts.synthesize(value, turn.signal)) {
        this.check(turn);
        if (firstAudio) {
          this.event("tts.first_audio", turn, ttsStarted);
          firstAudio = false;
        }
        await this.options.output.play(pcm, turn);
        this.check(turn);
      }
    };
    try {
      for await (const token of this.options.brain.reply(
        text,
        history,
        turn.signal,
      )) {
        this.check(turn);
        if (first) {
          this.event("reply.first_token", turn, began);
          first = false;
        }
        reply += token;
        currentJournal()?.partial(token);
        sentence += token;
        if (reply.length > 4000) throw new Error("reply_size");
        // Consume TTS sequentially: no unbounded sentence queue or parallel billing.
        let index;
        while (
          (index = sentence.search(/[。！？!?\n]/)) >= 0 ||
          sentence.length >= 120
        ) {
          const end = index >= 0 ? index + 1 : 120;
          const part = sentence.slice(0, end);
          sentence = sentence.slice(end);
          await say(part);
        }
      }
      await say(sentence);
      if (speak) await this.options.output.finish?.(turn);
      this.check(turn);
      this.history.add(text, reply);
      this.options.onReply?.(reply);
      this.event("reply.completed", turn, started);
      return reply;
    } catch (error) {
      if (this.turns.isCurrent(turn))
        await Promise.allSettled([
          this.options.device.cancel(turn.id),
          this.options.output.cancel(turn.id),
        ]);
      throw error;
    }
  }
}
