#include "character/eyes_model.h"
#include <cassert>
#include <cmath>
#include <cstdio>
using namespace round_eyes;
static Point Center(const Frame& f){Point p;for(const auto& eye:f.eyes)for(auto q:eye){p.x+=q.x;p.y+=q.y;}p.x/=96;p.y/=96;return p;}
int main(){
 for(auto kind:{HeadGesture::Nod,HeadGesture::HeadShake}){
  assert(HeadGestureValue(kind,0,4200)==0&&HeadGestureValue(kind,4200,4200)==0);
  for(int boundary:{336,3360}){
   const float a=HeadGestureValue(kind,boundary-1,4200),b=HeadGestureValue(kind,boundary,4200),c=HeadGestureValue(kind,boundary+1,4200);
   assert(std::abs(c-a)<.00001f&&std::abs(a-2*b+c)<.00001f);
  }
  AnimationPlan plan;plan.count=1;plan.steps[0].duration_ms=4200;auto& cue=plan.steps[0].motion;cue.emotion=kind==HeadGesture::Nod?1:0;cue.gesture=kind;cue.blink=0;cue.transition_ms=700;
  AnimationTrack track;assert(track.Start(plan,0));const auto key=track.Read(0).key;EyesModel model(42);Point before{};float max_delta=0,x0=240,x1=0,y0=240,y1=0;
  for(uint64_t t=0;t<4200;t+=40){auto motion=track.Read(t);assert(motion.key==key&&motion.gesture_duration_ms==4200);model.SetMotion(motion);auto frame=model.Tick(t);const auto p=Center(frame);
   if(t)max_delta=std::max(max_delta,std::hypot(p.x-before.x,p.y-before.y));before=p;
   if(t>=1000){x0=std::min(x0,p.x);x1=std::max(x1,p.x);y0=std::min(y0,p.y);y1=std::max(y1,p.y);}
   assert(frame.pose==(kind==HeadGesture::Nod?2:0));
   for(auto& eye:frame.eyes)for(auto q:eye)assert(std::isfinite(q.x)&&std::isfinite(q.y)&&std::hypot(q.x-120,q.y-120)<118);
  }
  assert(max_delta<7);
  if(kind==HeadGesture::Nod){assert(y1-y0>30&&x1-x0<5);}else{assert(x1-x0>45&&y1-y0<5);}
  assert(!track.Read(4200).active);track.Clear();assert(!track.Read(5000).active);
  // Cancelling in mid-swing must carry momentum instead of snapping to zero.
  assert(track.Start(plan,0));EyesModel interrupted(42);Point last{};
  for(uint64_t t=0;t<=1600;t+=40){interrupted.SetMotion(track.Read(t));last=Center(interrupted.Tick(t));}
  track.Clear();
  for(uint64_t t=1640;t<=2400;t+=40){interrupted.SetMotion(track.Read(t));const auto p=Center(interrupted.Tick(t));assert(std::hypot(p.x-last.x,p.y-last.y)<7);last=p;}
  std::printf("PASS continuous %s: one motion key, fixed eye pose, max40ms center delta=%.2fpx, span=%.1fx%.1f\n",kind==HeadGesture::Nod?"nod":"head shake",max_delta,x1-x0,y1-y0);
  plan.steps[0].duration_ms=2799;assert(!ValidAnimation(plan));plan.steps[0].duration_ms=4200;cue.gesture=static_cast<HeadGesture>(255);assert(!ValidAnimation(plan));
 }
}
