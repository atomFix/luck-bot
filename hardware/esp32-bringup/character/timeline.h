#pragma once
#include <array>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <mutex>
namespace round_eyes {
struct MotionCue {bool active=false;uint8_t emotion=0;float look_x=0,look_y=0,scale=1,shake=0,blink=1;uint16_t transition_ms=300;bool blink_once=false;uint32_t key=0;};
struct AnimationStep {MotionCue motion{};uint16_t duration_ms=0;};
struct AnimationPlan {std::array<AnimationStep,12> steps{};uint8_t count=0;};
inline bool ValidAnimation(const AnimationPlan& p){
 if(!p.count||p.count>12)return false;
 uint32_t total=0;
 for(size_t i=0;i<p.count;i++){const auto& s=p.steps[i];const auto& m=s.motion;
  if(s.duration_ms<200||s.duration_ms>5000||m.emotion>=21||m.transition_ms<120||m.transition_ms>1500)return false;
  for(float v:{m.look_x,m.look_y,m.scale,m.shake,m.blink})if(!std::isfinite(v))return false;
  if(std::abs(m.look_x)>1||std::abs(m.look_y)>1||m.scale<.65f||m.scale>1.2f||m.shake<0||m.shake>1||m.blink<0||m.blink>3)return false;
  total+=s.duration_ms;
 }return total<=30000;
}
class AnimationTrack {
 mutable std::mutex mutex_;AnimationPlan plan_{};uint64_t start_=0;uint32_t revision_=0;
public:
 bool Start(const AnimationPlan& plan,uint64_t now){if(!ValidAnimation(plan))return false;std::lock_guard<std::mutex> lock(mutex_);plan_=plan;start_=now;revision_++;return true;}
 void Clear(){std::lock_guard<std::mutex> lock(mutex_);plan_.count=0;}
 MotionCue Read(uint64_t now)const{std::lock_guard<std::mutex> lock(mutex_);uint64_t age=now>=start_?now-start_:0;for(size_t i=0;i<plan_.count;i++){if(age<plan_.steps[i].duration_ms){auto cue=plan_.steps[i].motion;cue.active=true;cue.key=revision_*16+i+1;return cue;}age-=plan_.steps[i].duration_ms;}return {};}
};
}
