import {
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type { Secrets } from "../contracts.js";
type Profile = {
  id: string;
  name: string;
  enabled: boolean;
  created_at: number;
  samples: number;
  embedding: number[];
};
export function normalized(vector: number[]) {
  if (
    !Array.isArray(vector) ||
    vector.length < 2 ||
    vector.length > 1024 ||
    vector.some((x) => !Number.isFinite(x))
  )
    throw new Error("speaker_vector");
  const norm = Math.sqrt(vector.reduce((n, x) => n + x * x, 0));
  if (norm < 1e-8) throw new Error("speaker_vector");
  return vector.map((x) => x / norm);
}
export function cosine(a: number[], b: number[]) {
  if (a.length !== b.length) throw new Error("speaker_vector");
  return a.reduce((sum, v, i) => sum + v * b[i]!, 0);
}
export class SpeakerProfiles {
  private profiles?: Profile[];
  private loading?: Promise<void>;
  private key?: Buffer;
  private changes: Promise<unknown> = Promise.resolve();
  private queued=0;
  private change<T>(fn:()=>Promise<T>):Promise<T>{
    if(this.queued>=16)return Promise.reject(new Error('speaker_busy'));
    this.queued++;const task=this.changes.then(fn);this.changes=task.catch(()=>{}).finally(()=>{this.queued--;});return task;
  }
  constructor(
    private file: string,
    private secrets: Secrets,
    readonly model: string,
  ) {}
  private async load() {
    if (this.profiles) return;
    if (this.loading) return this.loading;
    const task = this.loadOnce();
    this.loading = task;
    try {
      await task;
    } finally {
      this.loading = undefined;
    }
  }
  private async loadOnce() {
    let key = await this.secrets.get("provider/speaker-vault");
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error("speaker_vault_unavailable");
      if (!key) {
        key = randomBytes(32).toString("hex");
        await this.secrets.set("provider/speaker-vault", key);
      }
      if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("speaker_vault_invalid");
      this.key = Buffer.from(key, "hex");
      this.profiles = [];
      return;
    }
    if (!key || !/^[a-f0-9]{64}$/.test(key))
      throw new Error("speaker_vault_key_missing");
    this.key = Buffer.from(key, "hex");
    try {
      const envelope = JSON.parse(raw);
      if (envelope.model !== this.model)
        throw new Error("speaker_model_mismatch");
      if (envelope.version !== 1) throw new Error("speaker_vault_invalid");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        Buffer.from(envelope.iv, "base64"),
      );
      decipher.setAAD(Buffer.from(this.model));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
      const profiles = JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(envelope.data, "base64")),
          decipher.final(),
        ]).toString(),
      );
      if (!Array.isArray(profiles) || profiles.length > 10) throw new Error();
      for (const p of profiles) {
        if (
          typeof p.id !== "string" ||
          typeof p.name !== "string" ||
          typeof p.enabled !== "boolean" ||
          p.samples !== 3
        )
          throw new Error();
        p.embedding = normalized(p.embedding);
      }
      this.profiles = profiles;
    } catch (e) {
      if (e instanceof Error && e.message === "speaker_model_mismatch") throw e;
      throw new Error("speaker_vault_invalid");
    }
  }
  private async save(next: Profile[]) {
    if (!this.key) throw new Error("speaker_vault_invalid");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(this.model));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(next)),
      cipher.final(),
    ]);
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = this.file + "." + randomUUID() + ".tmp";
    await writeFile(
      tmp,
      JSON.stringify({
        version: 1,
        model: this.model,
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        data: encrypted.toString("base64"),
      }),
      { mode: 0o600 },
    );
    await rename(tmp, this.file);
    this.profiles = next;
  }
  async list() {
    await this.changes;await this.load();
    return this.profiles!.map(({ embedding, ...meta }) => meta);
  }
  async add(name: string, samples: number[][]) {
    return this.change(async()=>{await this.load();
    if (typeof name !== "string" || !name.trim() || name.length > 60)
      throw new Error("speaker_name");
    if (samples.length !== 3) throw new Error("speaker_samples");
    if (this.profiles!.length >= 10) throw new Error("speaker_limit");
    const vectors = samples.map(normalized);
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++)
        if (cosine(vectors[i]!, vectors[j]!) < 0.55)
          throw new Error("speaker_inconsistent");
    const embedding = normalized(
      vectors[0]!.map((_, i) => vectors.reduce((sum, v) => sum + v[i]!, 0) / 3),
    );
    const p: Profile = {
      id: randomUUID(),
      name: name.trim(),
      enabled: true,
      created_at: Date.now(),
      samples: 3,
      embedding,
    };
    await this.save([...this.profiles!, p]);
    const { embedding: ignored, ...meta } = p;
    return meta;});
  }
  async remove(id: string) {
    return this.change(async()=>{await this.load();
    if (!this.profiles!.some((p) => p.id === id))
      throw new Error("speaker_unknown");
    await this.save(this.profiles!.filter((p) => p.id !== id));});
  }
  async setEnabled(id: string, enabled: boolean) {
    return this.change(async()=>{await this.load();
    if (typeof enabled !== "boolean") throw new Error("speaker_input");
    if (!this.profiles!.some((p) => p.id === id))
      throw new Error("speaker_unknown");
    await this.save(
      this.profiles!.map((p) => (p.id === id ? { ...p, enabled } : p)),
    );});
  }
  async match(vector: number[], threshold = 0.7, margin = 0.08) {
    await this.changes;await this.load();
    if (
      !Number.isFinite(threshold) ||
      threshold < 0.55 ||
      threshold > 0.95 ||
      !Number.isFinite(margin) ||
      margin < 0.03 ||
      margin > 0.3
    )
      throw new Error("speaker_threshold");
    const input = normalized(vector);
    const ranked = this.profiles!.filter((p) => p.enabled)
      .map((p) => ({
        id: p.id,
        name: p.name,
        score: cosine(input, p.embedding),
      }))
      .sort((a, b) => b.score - a.score);
    const first = ranked[0];
    return first &&
      first.score >= threshold &&
      (!ranked[1] || first.score - ranked[1].score >= margin)
      ? first
      : null;
  }
}
