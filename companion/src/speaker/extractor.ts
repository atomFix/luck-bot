import { Worker } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { normalized } from "./profiles.js";
export class SpeakerExtractor {
  private worker?: Worker;
  private loading?: Promise<void>;
  private readyState = false;
  private error = "";
  private sequence = 0;
  private busy = false;
  private callbacks = new Map<
    number,
    {
      resolve: (v: number[]) => void;
      reject: (e: Error) => void;
      cleanup: () => void;
    }
  >();
  constructor(
    private base = fileURLToPath(new URL("../../", import.meta.url)),
  ) {}
  get status() {
    return {
      ready: this.readyState,
      error: this.error,
      model: "campplus-zh-16k-v1",
    };
  }
  async ready() {
    if (this.readyState) return;
    if (this.loading) return this.loading;
    this.loading = this.load();
    try {
      await this.loading;
    } finally {
      this.loading = undefined;
    }
  }
  private async load() {
    try {
      const manifest = JSON.parse(
        await readFile(join(this.base, "config/speaker-model.json"), "utf8"),
      );
      const model = join(this.base, "models", manifest.file);
      const bytes = await readFile(model);
      if (
        bytes.length !== manifest.size ||
        createHash("sha256").update(bytes).digest("hex") !== manifest.sha256
      )
        throw new Error();
      const worker = new Worker(
        new URL("./embedding-worker.mjs", import.meta.url),
        { workerData: { model }, execArgv: [] },
      );
      this.worker = worker;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("speaker_model_unavailable")),
          10000,
        );
        const ready = (m: any) => {
          if (m.ready) {
            clearTimeout(timer);
            worker.off("message", ready);
            this.readyState = true;
            resolve();
          } else if (m.error && !m.id) {
            clearTimeout(timer);
            reject(new Error("speaker_model_unavailable"));
          }
        };
        worker.on("message", ready);
        worker.on("error", () => {
          clearTimeout(timer);
          reject(new Error("speaker_model_unavailable"));
          this.fail();
        });
        worker.on("exit", () => this.fail());
        worker.on("message", (m) => {
          const p = this.callbacks.get(m.id);
          if (!p) return;
          this.busy = false;
          this.callbacks.delete(m.id);
          p.cleanup();
          m.error
            ? p.reject(new Error(m.error))
            : p.resolve(normalized(m.vector));
        });
      });
    } catch {
      this.error = "speaker_model_unavailable";
      this.readyState = false;
      await this.worker?.terminate();
      this.worker = undefined;
      throw new Error(this.error);
    }
  }
  private fail() {
    this.readyState = false;
    this.error = "speaker_model_unavailable";
    this.busy = false;
    for (const p of this.callbacks.values()) {
      p.cleanup();
      p.reject(new Error(this.error));
    }
    this.callbacks.clear();
  }
  async embed(pcm: Uint8Array, signal: AbortSignal) {
    signal.throwIfAborted();
    if (pcm.length < 32000 || pcm.length > 960000 || pcm.length % 2)
      throw new Error("speaker_audio_size");
    await this.ready();
    signal.throwIfAborted();
    if (this.busy) throw new Error("speaker_busy");
    this.busy = true;
    const id = ++this.sequence;
    return new Promise<number[]>((resolve, reject) => {
      const abort = () => {
        reject(new Error("cancelled"));
      };
      const timer = setTimeout(() => {
        this.callbacks.delete(id);
        this.busy = false;
        reject(new Error("speaker_inference_timeout"));
        void this.worker?.terminate();
      }, 10000);
      signal.addEventListener("abort", abort, { once: true });
      this.callbacks.set(id, {
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
        },
      });
      this.worker!.postMessage({ id, pcm: pcm.slice() });
    });
  }
  async close() {
    await this.worker?.terminate();
    this.worker = undefined;
    this.readyState = false;
  }
}
