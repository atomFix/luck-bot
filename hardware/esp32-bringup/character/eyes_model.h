#pragma once
#include <array>
#include "timeline.h"
#include <cstddef>
#include <cstdint>
#include <optional>
#include <string_view>

namespace round_eyes {
constexpr size_t kPoseCount = 25;
constexpr size_t kContourPoints = 48;
enum class Behavior { Idle, Waking, Listening, Waiting, Speaking, Reconnecting };
struct Point { float x = 0, y = 0; };
using Contour = std::array<Point, kContourPoints>;
struct Frame {
    std::array<Contour, 2> eyes{};
    uint8_t pose = 0;
    Behavior behavior = Behavior::Idle;
};
struct EyeParams {
    float x, y, width, height, angle, bend, power;
};
using Pose = std::array<EyeParams, 2>;
class EyesModel {
public:
    explicit EyesModel(uint32_t seed);
    void SetEmotion(std::string_view key, uint64_t now_ms);
    void SetBehavior(Behavior value, uint64_t now_ms);
    void ForcePose(std::optional<uint8_t> pose, uint64_t now_ms);
    void ObserveAudio(float energy, uint64_t now_ms);
    void SetMotion(const MotionCue& cue){motion_=cue;}
    Frame Tick(uint64_t now_ms);
private:
    MotionCue motion_{};
    float motion_shake_=0;uint32_t motion_key_=0;uint64_t motion_at_=0;
    uint32_t random_;
    uint32_t NextRandom();
    uint8_t emotion_ = 0, pose_ = 0;
    Behavior behavior_ = Behavior::Idle;
    std::optional<uint8_t> forced_;
    Pose current_{}, velocity_{};
    uint64_t last_ = 0, pose_at_ = 0, blink_at_ = 3500, audio_at_ = 0;
    float energy_ = 0;
    bool started_ = false;
};
const char* BehaviorName(Behavior behavior);
}  // namespace round_eyes
