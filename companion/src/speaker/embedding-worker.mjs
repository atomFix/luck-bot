import { parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";
let extractor;
try {
  const { SpeakerEmbeddingExtractor } = createRequire(import.meta.url)(
    "sherpa-onnx-node",
  );
  extractor = new SpeakerEmbeddingExtractor({
    model: workerData.model,
    numThreads: 1,
    provider: "cpu",
    debug: false,
  });
  if (extractor.dim !== 192) throw new Error();
  parentPort.postMessage({ ready: true, dimension: extractor.dim });
} catch {
  parentPort.postMessage({ error: "speaker_model_unavailable" });
}
parentPort.on("message", ({ id, pcm }) => {
  try {
    if (!extractor) throw new Error();
    const bytes = Buffer.from(pcm);
    if (bytes.length < 32000 || bytes.length > 960000 || bytes.length % 2)
      throw new Error();
    const samples = new Float32Array(bytes.length / 2);
    for (let i = 0; i < samples.length; i++)
      samples[i] = bytes.readInt16LE(i * 2) / 32768;
    const stream = extractor.createStream();
    stream.acceptWaveform({ sampleRate: 16000, samples });
    stream.inputFinished();
    if (!extractor.isReady(stream)) throw new Error();
    const vector = Array.from(extractor.compute(stream, false));
    if (vector.length !== 192 || vector.some((x) => !Number.isFinite(x)))
      throw new Error();
    parentPort.postMessage({ id, vector });
  } catch {
    parentPort.postMessage({ id, error: "speaker_inference_failed" });
  }
});
