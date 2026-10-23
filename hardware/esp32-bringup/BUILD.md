# 固件准备与构建

依赖：ESP-IDF **v5.5**（含递归子模块）、其支持的 Python 3.12 环境、CMake/Ninja、`rg`、`patch` 和 C++ 编译器。依照 Espressif 官方说明安装 ESP-IDF，设置 `IDF_PATH` 指向 SDK 根目录。脚本也支持默认路径 `hardware/esp32-bringup/vendor/esp-idf`。不要提交 SDK、构建目录、设备备份或个人配置。

从仓库根目录执行：

```sh
mkdir -p hardware/esp32-bringup/vendor
git clone --depth 1 --branch v1.9.4 https://github.com/78/xiaozhi-esp32.git hardware/esp32-bringup/vendor/xiaozhi-esp32-1.9.4

# 固定曾实测的组件清单基线：移除两个已退役且当前板型不用的依赖。
cp hardware/esp32-bringup/patches/companion-baseline/main/idf_component.yml hardware/esp32-bringup/vendor/xiaozhi-esp32-1.9.4/main/idf_component.yml
bash hardware/esp32-bringup/scripts/apply-eyes-patch.sh
bash hardware/esp32-bringup/scripts/apply-companion-patch.sh

# 将此处替换为你的 SDK 路径。首次按 SDK 官方指南安装工具链。
export IDF_PATH="$HOME/esp/esp-idf"
bash hardware/esp32-bringup/scripts/build-companion-firmware.sh
```

`apply-companion-patch.sh` 会检查每个受影响文件的精确基线哈希，再应用并校验结果；不匹配时停止，不应强行覆盖。CMake 通过相对路径引用仓库中的 `character/` 与 Companion 实现。

构建脚本使用 `patches/baseline/sdkconfig.eyes-on` 作为已保存的板型配置，生成的 `sdkconfig.companion` 和 `build-companion/` 留在被忽略的 vendor 目录。该基线不包含 Wi-Fi/API Key。不要把它替换为从设备读取的 NVS。

应用镜像位于：

```
hardware/esp32-bringup/vendor/xiaozhi-esp32-1.9.4/build-companion/xiaozhi.bin
```

## 刷写

先通过串口和分区表确认目标是 ESP32-S3 N16R8，读取备份并检查实际 OTA 选择。`scripts/inspect-eyes-ota.py` 可以解析读取到的 OTA 数据文件。不能直接套用本文历史记录里的端口和偏移，也不要使用默认整套 flash_args 覆盖已有模型、NVS、分区或引导程序。

确认运行应用槽后，仅向该应用槽写入本次构建的 `xiaozhi.bin`，保留其他区域。设备备份可能含凭据，只保留在本机被忽略的 `backups/` 目录。刷写完成还需要物理显示、BOOT 配对、麦克风和扬声器验收，构建通过不能代替实机验收。

## 验证记录

`companion/verification.json` 与 `VERIFICATION-eyes.json` 保存开发设备上的历史结果。`scripts/verify-companion.py` 只报告已有记录。`scripts/verify-eyes.py` 需要本机日志与固件文件才能重新生成记录；仓库不提交这些私有输入。
