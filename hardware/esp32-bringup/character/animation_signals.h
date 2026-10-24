#pragma once
#include "eyes_model.h"
#include <atomic>
namespace round_eyes {
// Values intentionally match upstream DeviceState; integration asserts the mapping.
enum class InputState { Unknown,Starting,WifiConfiguring,Idle,Connecting,Listening,Speaking,Upgrading,Activating,AudioTesting,FatalError };
struct SignalSnapshot {Behavior behavior;float energy;uint64_t audio_at_ms;bool critical;};
class AnimationSignals {
public:
 static AnimationSignals& Instance();
 void PublishDeviceState(InputState state,uint64_t now_ms);
 void NotifyRecognizedText(bool nonempty,uint64_t now_ms);
 void PublishPlayback(const int16_t* pcm,size_t count,uint64_t now_ms);
 void SetCompanionPose(uint32_t mode,bool manual){companion_pose_.store((mode&3)|(manual?4:0));}
 SignalSnapshot Read(uint64_t now_ms) const;
private:
 // Packed generation/state/waiting; only lock-free 32-bit atomics on ESP32.
 std::atomic<uint32_t> state_{1};
 std::atomic<uint32_t> companion_pose_{0};
 std::atomic<uint32_t> audio_{0},audio_at_{0};
 std::atomic<uint32_t> state_at_{0},wake_at_{0};
};
}
