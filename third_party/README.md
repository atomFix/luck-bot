# 第三方来源

ESP32 集成基于 Xiaozhi ESP32 v1.9.4：<https://github.com/78/xiaozhi-esp32/tree/v1.9.4>。
`hardware/esp32-bringup/patches/` 中包含上游源码基线及修改上下文，沿用上游 MIT 许可证，完整许可文本见 [xiaozhi-esp32-LICENSE](xiaozhi-esp32-LICENSE)。

Mac 程序依赖列在 `companion/package.json` / `package-lock.json`，第三方包不随源码提交。ESP-IDF、LVGL、组件依赖及 Node 运行时各自沿用其许可证。仓库不另行替用户选择原创代码的开源许可证。

本机句尾检测使用 Silero VAD 的 ONNX 模型（通过固定版本 `@ricky0123/vad-node@0.0.3` 随 npm 依赖提供；包装代码 ISC），模型来源 <https://github.com/snakers4/silero-vad>，许可见 [silero-vad-LICENSE](silero-vad-LICENSE)。推理由 Microsoft ONNX Runtime `onnxruntime-node@1.30.0` 执行（MIT；许可证随该 npm 包分发）。Mac 包仅保留 darwin/arm64 原生运行时，模型无需联网下载。

Speaker embedding uses `sherpa-onnx-node@2.0.0` and its official macOS arm64 native package (Apache-2.0); upstream: https://github.com/k2-fsa/sherpa-onnx; license retained in `sherpa-onnx-LICENSE` (official LICENSE blob d645695673349e3947e8e5ae42332d0ac3164cd7). Chinese CAMPPlus model is from the official speaker-recognition release, originating from ModelScope 3D-Speaker (Apache-2.0, `3d-speaker-LICENSE`). Exact model URL, byte count and SHA256 are pinned in `companion/config/speaker-model.json`; weights are downloaded into ignored `companion/models/` and included only in local signed application packages. Model runtime/finite-vector probes are not proof of speaker recognition accuracy for the user's microphone.
