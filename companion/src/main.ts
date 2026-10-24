import {LocalAsr} from './voice/local-asr.js';
import {SpeakerExtractor} from './speaker/extractor.js';
import {SpeakerProfiles} from './speaker/profiles.js';
import { Ledger } from "./ledger/repository.js";
import { TurnJournal } from "./ledger/journal.js";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { mkdir, writeFile, chmod, unlink, lstat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SettingsStore, DATA_DIR } from "./local/settings.js";
import { KeychainSecrets } from "./secrets.js";
import { startLocalServer } from "./local/server.js";
import { Companion } from "./app.js";
async function prepareSocket(path: string) {
  let entry;
  try {
    entry = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (!entry.isSocket() || entry.uid !== process.getuid?.())
    throw new Error("socket_ownership");
  const stale = await new Promise<boolean>((resolve, reject) => {
    const socket = createConnection(path);
    socket.setTimeout(500, () => {
      socket.destroy();
      reject(new Error("daemon_probe_timeout"));
    });
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", (error) => {
      socket.destroy();
      if ((error as NodeJS.ErrnoException).code === "ECONNREFUSED")
        resolve(true);
      else reject(new Error("daemon_probe_failed"));
    });
  });
  if (!stale) throw new Error("daemon_running");
  await unlink(path);
}
export async function startCompanion(dir = DATA_DIR) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const socket = join(dir, "control.sock");
  await prepareSocket(socket);
  let ledger: Ledger;
  try {
    ledger = await Ledger.open(join(dir, "companion.sqlite3"));
  } catch (error) {
    ledger = Ledger.unavailable(error);
  }
  const journal = new TurnJournal(ledger);
  const settings = new SettingsStore(dir);
  const secrets = new KeychainSecrets();
  const extractor=new SpeakerExtractor();
  const asr=new LocalAsr();
  const profiles=new SpeakerProfiles(join(dir,'speaker-vault.json'),secrets,extractor.status.model);
  const app = new Companion(settings, secrets, undefined, undefined, journal,{profiles,extractor,asr});
  await app.initialize();
  let local: Awaited<ReturnType<typeof startLocalServer>> | undefined;
  const daemon = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      if (req.method !== "POST" || req.url !== "/action")
        throw new Error("method");
      let body = "",
        bytes = 0;
      for await (const b of req) {
        bytes += b.length;
        if (bytes > 8192) throw new Error("body_size");
        body += b;
      }
      const { name, input } = JSON.parse(body);
      if (typeof name !== "string") throw new Error("action");
      const result =
        name === "open-ui"
          ? local
            ? { url: local.issueBootstrap() }
            : (() => {
                throw new Error("starting");
              })()
          : await app.action(name, input);
      res.end(JSON.stringify(result));
    } catch (e) {
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          error:
            e instanceof Error && /^[a-zA-Z0-9_.-]+$/.test(e.message)
              ? e.message
              : "operation_failed",
        }),
      );
    }
  });
  // Refuse a duplicate daemon. Only remove a proven stale Unix socket.
  await new Promise<void>((resolve, reject) => {
    daemon.once("error", reject);
    daemon.listen(socket, resolve);
  });
  await chmod(socket, 0o600);
  local = await startLocalServer({
    secretStore: secrets,
    actions: (n, b) => app.action(n, b),
    state: () => app.state(),
    credentialsChanged: () => app.resetServices(),
    admin: (op, input) => ledger.call(op, input),
    audio:id=>ledger.call("audio",{id}),
    speaker:(op,input)=>app.speakerAction(op,input),
  });
  const initial=await settings.read();
  if(initial.ambient.enabled&&initial.selected)void app.action('connect',{device_id:initial.selected,activate:true}).catch(()=>{});
  const url = local.url + "/#" + local.bootstrap;
  await writeFile(
    join(dir, "launch.json"),
    JSON.stringify({
      url,
      pid: process.pid,
      app_path: process.env.ROUND_EYES_APP_PATH ?? null,
    }),
    { mode: 0o600 },
  );
  const close = async () => {
    await app.close();
    await journal.close().catch(() => {});
    await ledger.close().catch(() => {});
    await local?.close();
    await new Promise<void>((r) => daemon.close(() => r()));
    await unlink(socket).catch(() => {});
  };
  return { url, close, app };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startCompanion()
    .then(({ url, close }) => {
      process.stdout.write(JSON.stringify({ event: "ready" }) + "\n");
      for (const event of ["SIGINT", "SIGTERM"] as const)
        process.once(event, () => {
          void close().finally(() => process.exit(0));
        });
    })
    .catch(() => {
      process.stderr.write("companion_start_failed\n");
      process.exitCode = 1;
    });
}
