#pragma once
#include <algorithm>
#include <cstdint>
namespace companion {
// 16 kHz first-order DC blocker, about 13 Hz cutoff. Keep speech-band energy
// while preventing a digital microphone's constant bias from driving VAD.
class DcBlocker {
 int32_t previous_input_=0,previous_output_=0;bool initialized_=false;
 public:
 void Reset(){initialized_=false;previous_input_=previous_output_=0;}
 int16_t Process(int16_t input){
  if(!initialized_){previous_input_=input;initialized_=true;return 0;}
  const int32_t output=int32_t(input)-previous_input_+previous_output_*32604/32768;
  previous_input_=input;previous_output_=std::clamp(output,int32_t(-32768),int32_t(32767));
  return int16_t(previous_output_);
 }
};
}
