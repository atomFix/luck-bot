import {
  SpeechEndpoint,
  SileroScorer,
  type SpeechScorer,
} from "../voice/endpoint.js";
import type { AudioFrame } from "../contracts.js";
export class AmbientSegmenter {
  private stream = -1;
  private next = 0;
  private endpoint: SpeechEndpoint;
  private pre: Uint8Array[] = [];
  private chunks: Uint8Array[] = [];
  private active = false;
  private dropping=false;
  private quietMs=0;
  private bytes = 0;
  constructor(
    private scorer: () => SpeechScorer = () => new SileroScorer(),
    private silenceMs = 1000,
  ) {
    this.endpoint = this.fresh();
  }
  private fresh() {
    const scorer=this.scorer();
    return new SpeechEndpoint({score:async frame=>{const p=await scorer.score(frame);this.quietMs=p<.35?this.quietMs+96:0;return p;}}, {
      continuous: true,
      silenceMs: this.silenceMs,
      maxSpeechMs: this.dropping?Number.MAX_SAFE_INTEGER:29500,
    });
  }
  start(stream: number) {
    if (!Number.isInteger(stream) || stream < 1)
      throw new Error("audio_stream");
    this.stream = stream;
    this.next = 0;
    this.reset();
  }
  reset() {
    this.dropping=false;this.quietMs=0;
    this.endpoint = this.fresh();
    this.pre = [];
    this.chunks = [];
    this.active = false;
    this.bytes = 0;
  }
  private discard(){this.reset();this.dropping=true;this.endpoint=this.fresh();return {type:"ignored" as const,code:"utterance_too_long" as const};}
  async push(
    frame: AudioFrame,
  ): Promise<
    | { type: "start" }
    | { type:"ignored";code:"utterance_too_long" }
    | { type: "end"; pcm: Uint8Array; voiced_ms: number }
    | null
  > {
    if (
      frame.stream_id !== this.stream ||
      frame.frame_seq !== this.next++ ||
      frame.turn_seq !== 0 ||
      frame.sample_rate_khz !== 16 ||
      frame.end ||
      frame.pcm.length !== 640
    ) {
      this.reset();
      throw new Error("audio_gap");
    }
    const pcm = frame.pcm.slice();
    if(this.dropping){await this.endpoint.push(pcm);if(this.quietMs>=this.silenceMs)this.reset();return null;}
    if (!this.active) {
      this.pre.push(pcm);
      if (this.pre.length > 25) this.pre.shift();
    } else {
      this.chunks.push(pcm);
      this.bytes += pcm.length;
      if (this.bytes > 960000) {
        return this.discard();
      }
    }
    let ended;
    try {
      ended = await this.endpoint.push(pcm);
    } catch (e) {
      if(e instanceof Error&&e.message==='utterance_too_long')return this.discard();
      this.reset();
      throw e;
    }
    if (!this.active && this.endpoint.hasSpeech) {
      this.active = true;
      this.chunks = this.pre;
      this.pre = [];
      this.bytes = this.chunks.reduce((n, b) => n + b.length, 0);
      return { type: "start" };
    }
    if (ended) {
      const result = {
        type: "end" as const,
        pcm: Buffer.concat(this.chunks),
        voiced_ms: this.endpoint.stats.voiced_ms,
      };
      this.reset();
      return result;
    }
    return null;
  }
}
