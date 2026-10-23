#pragma once
#include <array>
#include "protocol.h"
#include <cstdint>
#include <cstddef>
namespace companion {
struct PcmFrame {std::array<uint8_t,984> data{};size_t size=0;};
class Receiver {
 bool active_=false;uint32_t stream_=0,turn_=0,next_=0;
 public:
 void Reset(){active_=false;}
 bool Accept(const AudioHeader& h,uint32_t current){
  if(h.rate!=24||h.turn_seq!=current)return false;
  if(!active_||turn_!=current){if(h.frame_seq!=0)return false;active_=true;stream_=h.stream_id;turn_=current;next_=0;}
  if(h.stream_id!=stream_||h.frame_seq!=next_)return false;
  next_++;return true;
 }
};
class Capture {
 public:
 void Begin(uint32_t turn);void Cancel();bool Feed(const int16_t* data,size_t count,PcmFrame& out);
 bool active()const{return active_;}uint32_t turn()const{return turn_;}
 private:bool active_=false;uint32_t turn_=0,seq_=0,samples_=0,silence_=0;bool heard_=false;
};
}
