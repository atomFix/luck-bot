import {capturePayload} from './payloads.mjs';
import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { chmodSync, existsSync, copyFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { decimal, total, estimate } from "./money.mjs";
const path = workerData.path;
let db, initError;
const now = () => Date.now();
const json = (x) => JSON.stringify(x);
const parse = (x) => (x ? JSON.parse(x) : null);
try {
  const existed = existsSync(path);
  db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000");
  const version = db.prepare("PRAGMA user_version").get().user_version;
  if (version > 2) throw new Error("storage_future_schema");
  if (version < 1) {
    if (existed) {
      const backup = path + ".pre-v1-" + now();
      copyFileSync(path, backup);
      chmodSync(backup, 0o600);
    }
    db.exec(`BEGIN;CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL);
 CREATE TABLE sessions(id TEXT PRIMARY KEY,device_id TEXT,boot_id TEXT,session_id TEXT,started_at INTEGER,ended_at INTEGER,mode TEXT);
 CREATE TABLE turns(id TEXT PRIMARY KEY,session_id TEXT,device_id TEXT,device_turn INTEGER,boot_id TEXT,mode TEXT NOT NULL,status TEXT NOT NULL,started_at INTEGER NOT NULL,ended_at INTEGER,duration_ms INTEGER,user_text TEXT,reply_text TEXT,emotion TEXT,hold_ms INTEGER,error TEXT,speaker_id TEXT,speaker_name TEXT,meta TEXT NOT NULL DEFAULT '{}');
 CREATE INDEX turns_time ON turns(started_at);CREATE INDEX turns_mode ON turns(mode,status);
 CREATE TABLE turn_spans(id TEXT PRIMARY KEY,turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,event TEXT NOT NULL,at_ms REAL,duration_ms REAL,meta TEXT);
 CREATE TABLE provider_attempts(id TEXT PRIMARY KEY,logical_id TEXT NOT NULL,turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,kind TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,actual_model TEXT,started_at INTEGER NOT NULL,ended_at INTEGER,duration_ms REAL,status TEXT NOT NULL,error TEXT,request_id TEXT,usage TEXT,price_snapshot TEXT NOT NULL);
 CREATE TABLE usage_items(attempt_id TEXT NOT NULL REFERENCES provider_attempts(id) ON DELETE CASCADE,metric TEXT NOT NULL,value INTEGER NOT NULL,source TEXT NOT NULL,PRIMARY KEY(attempt_id,metric));
 CREATE TABLE price_versions(id TEXT PRIMARY KEY,provider TEXT NOT NULL,model TEXT NOT NULL,metric TEXT NOT NULL,currency TEXT NOT NULL,unit INTEGER NOT NULL,price TEXT NOT NULL,effective_at INTEGER NOT NULL,note TEXT);
 CREATE TABLE cost_items(attempt_id TEXT NOT NULL REFERENCES provider_attempts(id) ON DELETE CASCADE,kind TEXT NOT NULL,currency TEXT NOT NULL,amount TEXT NOT NULL,metric TEXT NOT NULL,PRIMARY KEY(attempt_id,kind,currency,metric));
 CREATE TABLE admin_events(id TEXT PRIMARY KEY,event TEXT NOT NULL,at INTEGER NOT NULL,meta TEXT NOT NULL);
 CREATE TABLE admin_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);INSERT INTO admin_settings VALUES('record_text','true');INSERT INTO schema_migrations VALUES(1,${now()});PRAGMA user_version=1;COMMIT;`);
  }
  if(version < 2) {
    db.exec(`BEGIN;CREATE TABLE model_payloads(attempt_id TEXT PRIMARY KEY REFERENCES provider_attempts(id) ON DELETE CASCADE,request_data TEXT,response_data TEXT);INSERT INTO schema_migrations VALUES(2,${now()});PRAGMA user_version=2;COMMIT;`);
  }
  db.exec(
    "PRAGMA journal_mode=WAL; UPDATE turns SET status='interrupted',error='app_interrupted' WHERE status='running';UPDATE provider_attempts SET status='interrupted',error='usage_unknown' WHERE status='running';",
  );
  for (const suffix of ["", "-wal", "-shm"])
    if (existsSync(path + suffix)) chmodSync(path + suffix, 0o600);
} catch (e) {
  initError = /^storage_/.test(e.message) ? e.message : "storage_init_failed";
}
const string = (x, max = 160) => {
  if (typeof x !== "string" || !x.length || x.length > max)
    throw new Error("ledger_input");
  return x;
};
const integer = (x, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(x) || x < min || x > max)
    throw new Error("ledger_input");
  return x;
};
const identifier = (x) => {
  string(x);
  if (!/^[a-zA-Z0-9_.:-]+$/.test(x)) throw new Error("ledger_input");
  return x;
};
const text = (x) => (x == null ? null : string(x, 8000));
const recordText = () =>
  db.prepare("SELECT value FROM admin_settings WHERE key='record_text'").get()
    .value === "true";
function where(input) {
  const conditions = [],
    args = [];
  for (const key of ["mode", "status", "device_id", "speaker_id"])
    if (input[key]) {
      conditions.push(`${key}=?`);
      args.push(string(input[key]));
    }
  if (input.from != null) {
    conditions.push("started_at>=?");
    args.push(integer(input.from));
  }
  if (input.to != null) {
    conditions.push("started_at<?");
    args.push(integer(input.to));
  }
  if (input.q) {
    conditions.push(
      "(instr(COALESCE(user_text,''),?)>0 OR instr(COALESCE(reply_text,''),?)>0)",
    );
    args.push(string(input.q, 200), input.q);
  }
  return {
    sql: conditions.length ? " WHERE " + conditions.join(" AND ") : "",
    args,
  };
}
function audit(event, meta = {}) {
  db.prepare("INSERT INTO admin_events VALUES(?,?,?,?)").run(
    randomUUID(),
    event,
    now(),
    json(meta),
  );
}
function metrics(attempt) {
  const prices = parse(attempt.price_snapshot) ?? [];
  if (["reaction", "reply"].includes(attempt.kind)) {
    return prices.some((p) =>
      ["cache_hit_tokens", "cache_miss_tokens"].includes(p.metric),
    )
      ? ["cache_hit_tokens", "cache_miss_tokens", "output_tokens"]
      : ["input_tokens", "output_tokens"];
  }
  if (attempt.kind === "asr") return ["measured_audio_ms"];
  if (attempt.kind === "tts") return ["measured_input_characters"];
  return [];
}
function incomplete(attempt, costs) {
  if (costs.some((c) => c.kind === "provider_reported")) return false;
  const required = metrics(attempt);
  return (
    attempt.status !== "completed" ||
    !required.length ||
    required.some((metric) => !costs.some((c) => c.metric === metric))
  );
}
function groupedCosts(costs) {
  const groups = new Map();
  for (const c of costs) {
    const key = c.kind + ":" + c.currency;
    const group = groups.get(key) ?? {
      kind: c.kind,
      currency: c.currency,
      amounts: [],
    };
    group.amounts.push(c.amount);
    groups.set(key, group);
  }
  return [...groups.values()].map((g) => ({
    kind: g.kind,
    currency: g.currency,
    amount: total(g.amounts),
  }));
}
function enrichTurn(turn) {
  const attempts = db
    .prepare("SELECT * FROM provider_attempts WHERE turn_id=?")
    .all(turn.id);
  let input = null,
    output = null;
  const costs = [];
  let missing = false;
  for (const a of attempts) {
    const u = parse(a.usage);
    if (u?.input_tokens != null) input = (input ?? 0) + u.input_tokens;
    if (u?.output_tokens != null) output = (output ?? 0) + u.output_tokens;
    const c = db
      .prepare("SELECT * FROM cost_items WHERE attempt_id=?")
      .all(a.id);
    missing ||= incomplete(a, c);
    costs.push(...c);
  }
  return {
    ...turn,
    input_tokens: input,
    output_tokens: output,
    costs: groupedCosts(costs),
    cost_incomplete: missing,
    attempts: attempts.length,
  };
}
function execute(op, i) {
  if (initError) throw new Error(initError);
  if (op === "ready") return { version: 2, record_text: recordText() };
  if (op === "close") {
    db.close();
    return { ok: true };
  }
  if (op === "beginTurn") {
    identifier(i.id);
    string(i.mode, 30);
    integer(i.started_at);
    db.prepare(
      "INSERT OR IGNORE INTO turns(id,session_id,device_id,device_turn,boot_id,mode,status,started_at,user_text,speaker_id,speaker_name) VALUES(?,?,?,?,?,?,'running',?,?,?,?)",
    ).run(
      i.id,
      i.session_id ?? null,
      i.device_id ?? null,
      i.device_turn ?? null,
      i.boot_id ?? null,
      i.mode,
      i.started_at,
      recordText() ? text(i.user_text) : null,
      i.speaker_id ?? null,
      i.speaker_name ?? null,
    );
    return { id: i.id };
  }
  if (op === "patchTurn") {
    identifier(i.id);
    const fields = [],
      args = [];
    for (const key of [
      "status",
      "ended_at",
      "duration_ms",
      "user_text",
      "reply_text",
      "emotion",
      "hold_ms",
      "error",
      "device_turn",
      "speaker_id",
      "speaker_name",
    ])
      if (key in i) {
        let value = i[key];
        if (key === "speaker_name") value = text(value);
        else if (["user_text", "reply_text"].includes(key))
          value = recordText() ? text(value) : null;
        else if (
          ["ended_at", "duration_ms", "hold_ms", "device_turn"].includes(key) &&
          value !== null
        )
          integer(value);
        else if (value !== null) identifier(value);
        fields.push(key + "=?");
        args.push(value);
      }
    if (fields.length)
      db.prepare("UPDATE turns SET " + fields.join(",") + " WHERE id=?").run(
        ...args,
        i.id,
      );
    return { ok: true };
  }
  if (op === "span") {
    identifier(i.turn_id);
    identifier(i.event);
    const meta = {};
    for (const key of ["bytes", "code", "turn"])
      if (i[key] != null)
        meta[key] =
          typeof i[key] === "number" ? integer(i[key]) : identifier(i[key]);
    db.prepare("INSERT OR IGNORE INTO turn_spans VALUES(?,?,?,?,?,?)").run(
      i.id ?? randomUUID(),
      i.turn_id,
      i.event,
      i.at_ms ?? null,
      i.duration_ms ?? null,
      json(meta),
    );
    return { ok: true };
  }
  if (op === "beginAttempt") {
    for (const key of [
      "id",
      "logical_id",
      "turn_id",
      "kind",
      "provider",
      "model",
    ])
      identifier(i[key]);
    const prices = db
      .prepare(
        "SELECT * FROM price_versions WHERE provider=? AND model=? AND effective_at<=? ORDER BY effective_at DESC,id DESC",
      )
      .all(i.provider, i.model, i.started_at);
    const chosen = [...new Map(prices.map((p) => [p.metric, p])).keys()].map(
      (metric) => prices.find((p) => p.metric === metric),
    );
    db.prepare(
      "INSERT OR IGNORE INTO provider_attempts(id,logical_id,turn_id,kind,provider,model,started_at,status,price_snapshot) VALUES(?,?,?,?,?,?,?,'running',?)",
    ).run(
      i.id,
      i.logical_id,
      i.turn_id,
      i.kind,
      i.provider,
      i.model,
      integer(i.started_at),
      json(chosen),
    );
    if(recordText() && ["reaction","reply"].includes(i.kind) && i.request_data != null)
      db.prepare("INSERT OR IGNORE INTO model_payloads(attempt_id,request_data) VALUES(?,?)").run(i.id,json(capturePayload(i.request_data)));
    return { id: i.id };
  }
  if (op === "finishAttempt") {
    identifier(i.id);
    identifier(i.status);
    const old = db
      .prepare("SELECT * FROM provider_attempts WHERE id=?")
      .get(i.id);
    if (!old) throw new Error("attempt_unknown");
    if (old.status !== "running") return { ok: true };
    const usage = {};
    for (const [key, value] of Object.entries(i.usage ?? {})) {
      identifier(key);
      integer(value);
      usage[key] = value;
    }
    db.exec("BEGIN");
    try {
      db.prepare(
        "UPDATE provider_attempts SET status=?,ended_at=?,duration_ms=?,error=?,request_id=?,actual_model=?,usage=? WHERE id=?",
      ).run(
        i.status,
        now(),
        i.duration_ms ?? null,
        i.error ? identifier(i.error) : null,
        i.request_id ? string(i.request_id, 200) : null,
        i.actual_model ? string(i.actual_model) : null,
        Object.keys(usage).length ? json(usage) : null,
        i.id,
      );
      if(recordText() && i.response_data != null)
        db.prepare("UPDATE model_payloads SET response_data=? WHERE attempt_id=?").run(json(capturePayload(i.response_data)),i.id);
      for (const [metric, value] of Object.entries(usage))
        db.prepare("INSERT INTO usage_items VALUES(?,?,?,?)").run(
          i.id,
          metric,
          value,
          metric.startsWith("measured_") ? "measured" : "provider",
        );
      const billable = metrics({ ...old, usage: json(usage) });
      for (const price of parse(old.price_snapshot)) {
        if (usage[price.metric] == null || !billable.includes(price.metric))
          continue;
        db.prepare("INSERT INTO cost_items VALUES(?,?,?,?,?)").run(
          i.id,
          "estimated",
          price.currency,
          estimate(price.price, usage[price.metric], price.unit),
          price.metric,
        );
      }
      if (i.actual_cost) {
        const c = i.actual_cost;
        decimal(c.amount);
        if (!/^[A-Z]{3}$/.test(c.currency)) throw new Error("currency_format");
        db.prepare("INSERT INTO cost_items VALUES(?,?,?,?,?)").run(
          i.id,
          "provider_reported",
          c.currency,
          c.amount,
          "total",
        );
      }
      db.exec("COMMIT");
      return { ok: true };
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  if (op === "list") {
    const w = where(i),
      size = integer(i.page_size ?? 25, 1, 100),
      page = integer(i.page ?? 1, 1, 1000000);
    const total = db
      .prepare("SELECT count(*) AS n FROM turns" + w.sql)
      .get(...w.args).n;
    return {
      items: db
        .prepare(
          "SELECT * FROM turns" +
            w.sql +
            " ORDER BY started_at DESC,id DESC LIMIT ? OFFSET ?",
        )
        .all(...w.args, size, (page - 1) * size)
        .map(enrichTurn),
      total,
      page,
      page_size: size,
    };
  }
  if (op === "detail") {
    identifier(i.id);
    const turn = db.prepare("SELECT * FROM turns WHERE id=?").get(i.id);
    if (!turn) throw new Error("turn_unknown");
    return {
      turn,
      spans: db
        .prepare("SELECT * FROM turn_spans WHERE turn_id=? ORDER BY rowid")
        .all(i.id)
        .map((r) => ({ ...r, meta: parse(r.meta) })),
      attempts: db
        .prepare(
          "SELECT * FROM provider_attempts WHERE turn_id=? ORDER BY rowid",
        )
        .all(i.id)
        .map((r) => ({
          ...r,
          payload: (()=>{const p=db.prepare("SELECT request_data,response_data FROM model_payloads WHERE attempt_id=?").get(r.id);return p?{request:parse(p.request_data),response:parse(p.response_data)}:null;})(),
          usage: parse(r.usage),
          price_snapshot: parse(r.price_snapshot),
          costs: db
            .prepare(
              "SELECT kind,currency,amount,metric FROM cost_items WHERE attempt_id=?",
            )
            .all(r.id),
        })),
    };
  }
  if (op === "summary") {
    const w = where(i);
    const turns = db
      .prepare("SELECT id,status,mode,duration_ms FROM turns" + w.sql)
      .all(...w.args);
    const ids = new Set(turns.map((t) => t.id));
    const attempts = db
      .prepare("SELECT * FROM provider_attempts")
      .all()
      .filter((a) => ids.has(a.turn_id));
    const selected = new Set(attempts.map((a) => a.id));
    const costs = db
      .prepare("SELECT * FROM cost_items")
      .all()
      .filter((c) => selected.has(c.attempt_id));
    const groups = new Map();
    for (const c of costs) {
      const key = c.kind + ":" + c.currency;
      const g = groups.get(key) ?? {
        kind: c.kind,
        currency: c.currency,
        amounts: [],
      };
      g.amounts.push(c.amount);
      groups.set(key, g);
    }
    const usage = {},
      by_model = {};
    for (const a of attempts) {
      const key = a.provider + "/" + a.model;
      const b = (by_model[key] ??= {
        provider: a.provider,
        model: a.model,
        attempts: 0,
        unknown_usage: 0,
        usage: {},
      });
      b.attempts++;
      if (!a.usage) b.unknown_usage++;
      for (const [k, v] of Object.entries(parse(a.usage) ?? {})) {
        usage[k] = (usage[k] ?? 0) + v;
        b.usage[k] = (b.usage[k] ?? 0) + v;
      }
    }
    const durations = turns
      .filter((t) => t.duration_ms != null)
      .map((t) => t.duration_ms)
      .sort((a, b) => a - b);
    const unknown = attempts.filter((a) =>
      incomplete(
        a,
        costs.filter((c) => c.attempt_id === a.id),
      ),
    ).length;
    return {
      turns: turns.length,
      statuses: turns.reduce(
        (o, t) => ((o[t.status] = (o[t.status] ?? 0) + 1), o),
        {},
      ),
      attempts: attempts.length,
      unknown_attempts: unknown,
      usage,
      by_model: Object.values(by_model),
      costs: [...groups.values()].map((g) => ({
        kind: g.kind,
        currency: g.currency,
        amount: total(g.amounts),
      })),
      latency: {
        n: durations.length,
        p50: durations.length
          ? durations[Math.ceil(0.5 * durations.length) - 1]
          : null,
        p95: durations.length
          ? durations[Math.ceil(0.95 * durations.length) - 1]
          : null,
      },
      record_text: recordText(),
    };
  }
  if (op === "prices")
    return db
      .prepare("SELECT * FROM price_versions ORDER BY effective_at DESC")
      .all();
  if (op === "savePrice") {
    for (const k of ["provider", "model", "metric"]) identifier(i[k]);
    if (!/^[A-Z]{3}$/.test(i.currency)) throw new Error("currency_format");
    decimal(i.price);
    integer(i.unit, 1);
    const id = i.id ?? randomUUID();
    db.prepare("INSERT INTO price_versions VALUES(?,?,?,?,?,?,?,?,?)").run(
      identifier(id),
      i.provider,
      i.model,
      i.metric,
      i.currency,
      i.unit,
      i.price,
      i.effective_at ?? now(),
      i.note ? string(i.note, 500) : null,
    );
    audit("price.saved", { id });
    return { id };
  }
  if (op === "privacy") {
    if (i.record_text != null) {
      if (typeof i.record_text !== "boolean") throw new Error("ledger_input");
      db.prepare(
        "UPDATE admin_settings SET value=? WHERE key='record_text'",
      ).run(String(i.record_text));
      audit("privacy.changed", { record_text: i.record_text });
    }
    return { record_text: recordText() };
  }
  if (op === "audit") {
    const allowed = [
      "credential.revealed",
      "credential.changed",
      "configuration.changed",
    ];
    if (!allowed.includes(i.event)) throw new Error("audit_event");
    audit(i.event, { provider: i.provider ? identifier(i.provider) : null });
    return { ok: true };
  }
  if (op === "clear") {
    integer(i.before);
    if (!["all", "text"].includes(i.scope)) throw new Error("ledger_input");
    const count = db
      .prepare(
        "SELECT count(*) AS n FROM turns WHERE started_at<? AND status!='running'",
      )
      .get(i.before).n;
    const confirmation = `${i.scope}:${i.before}:${count}`;
    if (i.confirm == null) return { count, confirmation };
    if (i.confirm !== confirmation) throw new Error("clear_confirmation");
    db.exec("BEGIN");
    try {
      if (i.scope === "all")
        db.prepare(
          "DELETE FROM turns WHERE started_at<? AND status!='running'",
        ).run(i.before);
      else
        db.prepare(
          "UPDATE turns SET user_text=NULL,reply_text=NULL WHERE started_at<? AND status!='running'",
        ).run(i.before);
      if(i.scope === "text") db.prepare("DELETE FROM model_payloads WHERE attempt_id IN (SELECT a.id FROM provider_attempts a JOIN turns t ON t.id=a.turn_id WHERE t.started_at<? AND t.status!='running')").run(i.before);
      audit("records.cleared", { count, scope: i.scope });
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return { count };
  }
  throw new Error("ledger_operation");
}
parentPort.on("message", ({ id, op, input }) => {
  try {
    parentPort.postMessage({ id, value: execute(op, input) });
  } catch (e) {
    const error = /^[a-z_]+$/.test(e.message)
      ? e.message
      : "storage_operation_failed";
    parentPort.postMessage({ id, error });
  }
});
