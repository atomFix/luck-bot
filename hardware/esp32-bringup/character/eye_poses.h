#pragma once
#include "eyes_model.h"
namespace round_eyes {
const Pose& GetPose(uint8_t id);
struct Playlist { const char* key; std::array<uint8_t,3> ids; uint8_t count; };
extern const std::array<Playlist,21> kEmotions;
}
