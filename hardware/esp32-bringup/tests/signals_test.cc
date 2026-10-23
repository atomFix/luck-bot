#include "character/animation_signals.h"
#include <cassert>
#include <cmath>
#include <cstdio>
using namespace round_eyes;
int main(){AnimationSignals s;s.PublishDeviceState(InputState::Listening,0);assert(s.Read(0).behavior==Behavior::Listening);
 s.NotifyRecognizedText(false,1);assert(s.Read(1).behavior==Behavior::Listening);
 s.NotifyRecognizedText(true,2);assert(s.Read(2).behavior==Behavior::Waiting);
 s.PublishDeviceState(InputState::Speaking,3);assert(s.Read(3).behavior==Behavior::Waiting);
 int16_t pcm[]={32767,-32768,32767,-32768};s.PublishPlayback(pcm,4,4);
 auto f=s.Read(4);assert(f.behavior==Behavior::Speaking&&std::isfinite(f.energy)&&f.energy>.9&&f.energy<=1);
 assert(s.Read(164).energy==0);s.PublishDeviceState(InputState::Listening,165);assert(s.Read(165).energy==0);
 s.PublishPlayback(pcm,4,166);assert(s.Read(166).energy==0); // stale output outside speaking is ignored
 s.PublishDeviceState(InputState::Idle,170);assert(s.Read(170).behavior==Behavior::Idle);
 s.PublishDeviceState(InputState::Speaking,180);int16_t zero[64]={};s.PublishPlayback(zero,64,181);assert(s.Read(181).energy==0);
 for(auto state:{InputState::WifiConfiguring,InputState::Upgrading,InputState::FatalError,InputState::Activating,InputState::AudioTesting}){s.PublishDeviceState(state,190);assert(s.Read(190).critical);}
 s.PublishDeviceState(InputState::Idle,200);s.PublishDeviceState(InputState::Listening,220);
 assert(s.Read(220).behavior==Behavior::Waking);assert(s.Read(520).behavior==Behavior::Listening);
 s.PublishDeviceState(InputState::Idle,600);s.PublishDeviceState(InputState::Connecting,620);
 assert(s.Read(620).critical);assert(!s.Read(2120).critical&&s.Read(2120).behavior==Behavior::Reconnecting);
 puts("PASS signals: STT waiting, actual PCM start, interrupt, expiry, silence, critical states");}
