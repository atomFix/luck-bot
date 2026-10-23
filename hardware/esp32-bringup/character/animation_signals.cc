#include "animation_signals.h"
#include <algorithm>
#include <cmath>
namespace round_eyes {
AnimationSignals& AnimationSignals::Instance(){static AnimationSignals s;return s;}
void AnimationSignals::PublishDeviceState(InputState state,uint64_t now){
 uint32_t old=state_.load();uint32_t next;
 const bool wake=(old&15)==static_cast<uint32_t>(InputState::Idle)&&(state==InputState::Listening||state==InputState::Connecting);
 if(wake)wake_at_.store(static_cast<uint32_t>(now));
 state_at_.store(static_cast<uint32_t>(now));
 do{next=((old+0x10000u)&0xffff0000u)|static_cast<uint32_t>(state);
  if(state==InputState::Speaking)next|=16;
  if(wake||(state==InputState::Listening&&(old&32)))next|=32;
 }while(!state_.compare_exchange_weak(old,next));
}
void AnimationSignals::NotifyRecognizedText(bool nonempty,uint64_t){
 if(!nonempty)return;
 uint32_t old=state_.load();
 while((old&15)==static_cast<uint32_t>(InputState::Listening)&&!state_.compare_exchange_weak(old,old|16)){}
}
void AnimationSignals::PublishPlayback(const int16_t* pcm,size_t count,uint64_t now){
 uint32_t state=state_.load();if((state&15)!=static_cast<uint32_t>(InputState::Speaking)||!pcm||!count)return;
 double sum=0;size_t samples=0;const size_t stride=std::max<size_t>(1,count/128);
 for(size_t i=0;i<count;i+=stride){float v=pcm[i]/32768.f;sum+=v*v;++samples;}
 uint32_t level=static_cast<uint32_t>(std::min(1.,std::sqrt(sum/samples)*1.8)*65535);
 audio_at_.store(static_cast<uint32_t>(now));audio_.store((state&0xffff0000u)|level);
 state_.compare_exchange_strong(state,state&~16u);
}
SignalSnapshot AnimationSignals::Read(uint64_t now)const{
 uint32_t state=state_.load(),audio=audio_.load(),at=audio_at_.load();
 const auto input=static_cast<InputState>(state&15);Behavior b=Behavior::Idle;bool critical=false;
 switch(input){
 case InputState::Starting:b=Behavior::Waking;critical=true;break;
 case InputState::Listening:b=Behavior::Listening;break;
 case InputState::Speaking:b=Behavior::Speaking;break;
 case InputState::Connecting:b=Behavior::Reconnecting;critical=static_cast<uint32_t>(now)-state_at_.load()<1500;break;
 case InputState::WifiConfiguring:case InputState::Upgrading:case InputState::Activating:case InputState::FatalError:case InputState::AudioTesting:critical=true;break;
 default:break;
 }
 if((state&32)&&static_cast<uint32_t>(now)-wake_at_.load()<300)b=Behavior::Waking;
 if(state&16)b=Behavior::Waiting;
 float energy=0;
 if(input==InputState::Speaking&&(audio&0xffff0000u)==(state&0xffff0000u)&&static_cast<uint32_t>(now)-at<160)energy=(audio&65535)/65535.f;
 const uint32_t age=static_cast<uint32_t>(now)-at;
 return {b,energy,now>=age?now-age:0,critical};
}
}
