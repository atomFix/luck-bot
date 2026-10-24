import {setTimeout as animationDelay} from 'node:timers/promises';
import {reactionAnimation,socialAnimation,primaryEmotion,animationSource,animationPosition,paceAnimation,animationReplacementDelay,conversationalAnimation,type AnimationPlan} from './animation.js';
import {performReaction} from './reaction-performance.js';
import {localReaction,requestedExpression} from './fast-reaction.js';
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
  asrModel?: string;
  animations?:boolean;
  thinking?:()=>Promise<unknown>;
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
  private animationStates=new Map<string,{plan:AnimationPlan;at:number}>();
  constructor(private options: Options) {}
  async interrupt() {
    this.animationStates.clear();
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
    this.speakerHistory.clear();this.animationStates.clear();
  }
  clearSpeaker(id: string) {
    this.speakerHistory.delete(id);this.animationStates.delete(id);
  }
  async expression(pcm: Uint8Array, id: number, speaker: string, beforeApply?: (signal:AbortSignal)=>Promise<void>, local?:{text?:string;fast:boolean;asr_ms?:number;model?:string;continued?:boolean}) {
    if(this.options.animations&&this.options.device.animate&&this.options.brain.animation)return this.animatedExpression(pcm,id,speaker,local);
    const turn = await this.begin(id);
    // begin() may cancel the previous turn, clearing its temporary eye layer.
    await this.options.device.react({emotion:"thinking",hold_ms:3000},turn,"voice");
    this.check(turn);
    let thinkingActive=true;
    const thinkingTimer=setInterval(()=>{if(thinkingActive&&!turn.signal.aborted)void this.options.device.react({emotion:"thinking",hold_ms:3000},turn,"voice").catch(()=>{});},1500);
    thinkingTimer.unref();
    const stopThinking=()=>{thinkingActive=false;clearInterval(thinkingTimer);};
    try {
    const t = performance.now();
    const text = local?.text!==undefined ? local.text : await this.options.asr.transcribe(wav16k(pcm), turn.signal);
    this.check(turn);
    if(local?.text!==undefined){const meta={event:"asr.local.done",turn:turn.id,duration_ms:local.asr_ms??Math.round(performance.now()-t),model:local.model};if(this.options.diagnose)this.options.diagnose(meta);else currentJournal()?.event(meta);}else this.event("asr.done", turn, t);
    currentJournal()?.patch({ user_text: text || null, device_turn: turn.id });
    if (!text.trim()) {stopThinking();await this.options.device.react({emotion:"neutral",hold_ms:300},turn,"voice");return;}
    let history = this.speakerHistory.get(speaker);
    if (!history) {
      if (this.speakerHistory.size >= 10)
        this.speakerHistory.delete(this.speakerHistory.keys().next().value!);
      history = new History();
      this.speakerHistory.set(speaker, history);
    }
    const start = performance.now();
    const quick=local?.fast?localReaction(text,history.snapshot()):null;
    const predicted = quick ?? await this.options.brain.reaction(
      text,
      history.snapshot(),
      turn.signal,
    );
    stopThinking();
    const reaction={...predicted,hold_ms:Math.max(2500,predicted.hold_ms)};
    this.check(turn);
    this.event(quick?"reaction.local":"reaction.ready", turn, start);
    currentJournal()?.patch({
      emotion: reaction.emotion,
      hold_ms: reaction.hold_ms,
    });
    const waiting=performance.now();
    await beforeApply?.(turn.signal);
    this.check(turn);
    if(performance.now()-waiting>=1)this.event("reaction.display_wait",turn,waiting);
    await performReaction(reaction,turn.signal,async value=>{
      this.check(turn);
      await this.options.device.react(value,turn,"voice");
      this.check(turn);
    },beforeApply,(name,start,value)=>{
      const meta={event:name,turn:turn.id,duration_ms:Math.round(performance.now()-start),code:value.emotion};
      if(this.options.diagnose)this.options.diagnose(meta);else currentJournal()?.event(meta);
    });
    history.add(text, "表情：" + reaction.emotion);
    return reaction;
    } finally {stopThinking();}
  }

  private async animatedExpression(pcm:Uint8Array,id:number,speaker:string,local?:{text?:string;fast:boolean;asr_ms?:number;model?:string;continued?:boolean}){
    // Advancing a semantic turn aborts stale work, without cancelling visible board motion.
    const turn=this.turns.start(id);await this.options.thinking?.();this.check(turn);
    const began=performance.now();const text=local?.text??await this.options.asr.transcribe(wav16k(pcm),turn.signal);this.check(turn);
    currentJournal()?.patch({user_text:text||null,device_turn:turn.id});
    const meta={event:local?.text!==undefined?'asr.local.done':'asr.done',turn:turn.id,duration_ms:local?.asr_ms??Math.round(performance.now()-began),model:local?.model??this.options.asrModel};
    if(this.options.diagnose)this.options.diagnose(meta);else currentJournal()?.event(meta);
    if(!text.trim())return;
    let previous=this.animationStates.get(speaker);
    if(previous&&performance.now()-previous.at>60000){this.speakerHistory.delete(speaker);this.animationStates.delete(speaker);previous=undefined;}
    let history=this.speakerHistory.get(speaker);
    if(!history){if(this.speakerHistory.size>=10)this.speakerHistory.delete(this.speakerHistory.keys().next().value!);history=new History(12,6000);this.speakerHistory.set(speaker,history);}
    const position=previous?animationPosition(previous.plan,Math.round(performance.now()-previous.at)):undefined;
    const requested=requestedExpression(text);
    const conversation=requested?null:conversationalAnimation(text,position?.step?position.emotion:'neutral');
    const quick=requested??(local?.fast?localReaction(text,history.snapshot()):null);
    const context=history.snapshot();
    if(position)context.push({role:'assistant',content:'当前板端动画状态：'+JSON.stringify(position)});
    context.push({role:'user',content:local?.continued?'本次是连续讲述中的时间窗口，句子可能未说完；只回应已经明确的内容，不推断结局。':'本次在自然停顿后识别；不把缺少含义的残句猜成完整故事。'});
    const chosen=conversation??(quick?(requested?reactionAnimation(quick):socialAnimation(quick,text)):await this.options.brain.animation!(text,context,turn.signal));this.check(turn);
    const plan=requested?chosen:paceAnimation(chosen);
    const elapsed=previous?Math.round(performance.now()-previous.at):0;
    const remaining=previous?previous.plan.steps.reduce((n,s)=>n+s.duration_ms,0)-elapsed:0;
    const current=previous?animationPosition(previous.plan,elapsed):undefined;
    // Repeated context may confirm the same scene; don't replay its emotional opening.
    if(!requested&&!conversation&&previous&&remaining>=1400&&current?.step&&current.emotion!=='neutral'&&JSON.stringify(plan)===JSON.stringify(previous.plan)){
      await currentJournal()?.saveAnimation(previous.plan,'continued');
      const event={event:'animation.continued',turn:turn.id,code:plan.scene};
      if(this.options.diagnose)this.options.diagnose(event);else currentJournal()?.event(event);
      currentJournal()?.patch({emotion:current.emotion,hold_ms:Math.round(remaining)});
      history.add(text,'表情：'+current.emotion+'；动画：'+plan.scene+'；延续当前阶段');
      return {emotion:current.emotion,hold_ms:Math.round(remaining)};
    }
    // A bounded pause protects the current pose, without queueing an obsolete full scene.
    const buffer=!requested&&!conversation&&previous?animationReplacementDelay(previous.plan,elapsed):0;
    if(buffer){const start=performance.now();await animationDelay(buffer,undefined,{signal:turn.signal});this.check(turn);const event={event:'animation.display_buffer',turn:turn.id,duration_ms:Math.round(performance.now()-start)};if(this.options.diagnose)this.options.diagnose(event);else currentJournal()?.event(event);}
    const emotion=primaryEmotion(plan),duration=plan.steps.reduce((n,s)=>n+s.duration_ms,0);
    await currentJournal()?.saveAnimation(plan,conversation?'context':quick?'local':animationSource(plan));
    const started=performance.now();await this.options.device.animate!(plan,turn);this.check(turn);
    if(this.animationStates.size>=10&&!this.animationStates.has(speaker))this.animationStates.delete(this.animationStates.keys().next().value!);this.animationStates.set(speaker,{plan,at:performance.now()});
    const event={event:'animation.applied',turn:turn.id,duration_ms:Math.round(performance.now()-started),code:plan.scene};
    if(this.options.diagnose)this.options.diagnose(event);else currentJournal()?.event(event);
    currentJournal()?.patch({emotion,hold_ms:duration});
    history.add(text,'表情：'+emotion+'；动画：'+plan.scene);
    return {emotion,hold_ms:duration};
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
      ...(event==="asr.done"&&this.options.asrModel?{model:this.options.asrModel}:{}),
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
