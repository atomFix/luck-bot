import { Worker } from "node:worker_threads";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
export class Ledger {
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private failure = "";
  private closed = false;
  private constructor(private worker: Worker) {
    worker.on("message", (m) => {
      const p = this.pending.get(m.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(m.id);
      if (m.error) {
        if (m.error.startsWith("storage_")) this.failure = m.error;
        p.reject(new Error(m.error));
      } else p.resolve(m.value);
    });
    worker.on("error", () => this.fail());
    worker.on("exit", (code) => {
      if (!this.closed || code !== 0) this.fail();
    });
  }
  private fail() {
    this.failure = "storage_unavailable";
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(this.failure));
    }
    this.pending.clear();
  }
  static async open(path: string) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const ledger = new Ledger(
      new Worker(new URL("./sqlite-worker.mjs", import.meta.url), {
        workerData: { path },
        execArgv: [],
      }),
    );
    try {
      await ledger.call("ready", {});
      return ledger;
    } catch (e) {
      await ledger.worker.terminate();
      throw e;
    }
  }
  get health() {
    return { ok: !this.failure && !this.closed, error: this.failure };
  }
  call(op: string, input: Record<string, any> = {}): Promise<any> {
    if (this.closed || this.failure)
      return Promise.reject(new Error("storage_unavailable"));
    if (this.pending.size >= 128) {
      this.failure = "storage_overflow";
      return Promise.reject(new Error(this.failure));
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.fail();
        reject(new Error("storage_timeout"));
      }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, op, input });
    });
  }
  async close() {
    if (this.closed) return;
    try {
      await this.call("close");
    } finally {
      this.closed = true;
      await this.worker.terminate();
    }
  }
}
