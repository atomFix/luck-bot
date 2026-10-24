#pragma once
#include "eyes_model.h"
namespace round_eyes {
const Pose& GetPose(uint8_t id);
const Facing& GetPoseFacing(uint8_t id);
float GetPoseRadius(uint8_t id);
float GetPoseExtent(uint8_t id);
struct Playlist { const char* key; std::array<uint8_t,4> ids; uint8_t count; uint16_t cycle_ms; };
extern const std::array<Playlist,kEmotionCount> kEmotions;
}
