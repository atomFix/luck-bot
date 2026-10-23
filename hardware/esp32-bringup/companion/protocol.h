#pragma once
#include <cstdint>
#include <cstddef>
namespace companion {
inline bool Expired(uint32_t now,uint32_t deadline){return static_cast<int32_t>(now-deadline)>=0;}
struct AudioHeader {uint32_t stream_id,frame_seq,turn_seq;uint16_t payload_len;uint8_t rate;bool end;};
bool DecodeAudio(const uint8_t* data,size_t size,AudioHeader& out);
bool ValidReaction(const char* emotion,uint32_t hold);
}
