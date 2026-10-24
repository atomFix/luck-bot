#include "character/eyes_model.h"
#include "character/eye_poses.h"
#include "character/rasterize.h"
#include <cassert>
#include <cmath>
#include <cstdio>
using namespace round_eyes;
static void InCanvas(const Frame& f){
 for(const auto& eye:f.eyes)for(auto p:eye){
  if(!(p.y>=kRasterTop+1&&p.y<kRasterTop+kRasterHeight-1&&p.x>=1&&p.x<239)){
   std::fprintf(stderr,"out of canvas pose=%u x=%f y=%f\n",f.pose,p.x,p.y);assert(false);
  }
  assert((p.x-120)*(p.x-120)+(p.y-120)*(p.y-120)<118*118);
 }
}
static float Area(const Contour& c){float a=0;for(size_t i=0;i<c.size();i++){auto p=c[i],q=c[(i+1)%c.size()];a+=p.x*q.y-q.x*p.y;}return std::abs(a)*.5f;}
static float Span(const Contour& c,bool horizontal){float low=240,high=0;for(auto p:c){const float v=horizontal?p.x:p.y;low=std::min(low,v);high=std::max(high,v);}return high-low;}
int main(){
 for(size_t i=0;i<kEmotionCount;i++)assert(std::string_view(kEmotions[i].key)==kEmotionKeys[i]);
 for(uint8_t i=0;i<kPoseCount;i++)for(const auto& eye:GetPose(i))assert(eye.bend==0); // no hooked smile silhouettes
 // Every callable emotion at the extreme accepted look/size/shake values.
 for(auto behavior:{Behavior::Idle,Behavior::Listening,Behavior::Waiting,Behavior::Speaking,Behavior::Reconnecting})
 for(unsigned emotion=0;emotion<kEmotions.size();++emotion)
 for(auto gesture:{HeadGesture::None,HeadGesture::Nod,HeadGesture::HeadShake})
 for(float x:{-1.f,1.f})for(float y:{-1.f,1.f})for(float scale:{.65f,1.2f}){
  EyesModel m(42);MotionCue cue;cue.active=true;cue.key=1;cue.emotion=emotion;
  cue.look_x=x;cue.look_y=y;cue.scale=scale;cue.shake=1;cue.transition_ms=120;
  cue.gesture=gesture;cue.gesture_duration_ms=4200;
  m.SetBehavior(behavior,0);m.SetMotion(cue);
  for(uint64_t t=0;t<=6500;t+=20){m.ObserveAudio(1,t);InCanvas(m.Tick(t));}
 }
 // Short active steps restart their own pose playlist rather than inheriting idle age.
 EyesModel m(7);m.Tick(0);m.Tick(6000);MotionCue cue;cue.active=true;cue.key=7;cue.emotion=1;
 m.SetMotion(cue);assert(m.Tick(6020).pose==kEmotions[1].ids[0]);
 assert(m.Tick(6020+kEmotions[1].cycle_ms).pose==kEmotions[1].ids[1]);
 cue.key=8;m.SetMotion(cue);assert(m.Tick(7100).pose==kEmotions[1].ids[0]);
 assert(kEmotions[4].ids[0]!=kEmotions[6].ids[0]); // sad / crying
 assert(kEmotions[13].ids[0]!=kEmotions[17].ids[0]); // cool / confident
 // Giant silhouettes must occupy the round face, not silently shrink into the old eye band.
 for(uint8_t pose:{45,47}){
  EyesModel giant(42);giant.ForcePose(pose,0);Frame frame;for(uint64_t t=0;t<=1600;t+=40)frame=giant.Tick(t);
  const auto big=pose==45?0:1,small=1-big;
  assert(Span(frame.eyes[big],true)>200&&Span(frame.eyes[big],false)>200);
  assert(Area(frame.eyes[big])>30000&&Area(frame.eyes[big])>Area(frame.eyes[small])*80);
 }
 EyesModel double_giant(42);double_giant.ForcePose(43,0);Frame huge;for(uint64_t t=0;t<=1600;t+=40)huge=double_giant.Tick(t);
 assert(Span(huge.eyes[0],false)>170&&Span(huge.eyes[1],false)>170);
 assert(Area(huge.eyes[0])+Area(huge.eyes[1])>26000);
 std::puts("PASS expressive motion: extreme controls stay in cropped canvas; distinct poses and per-step cadence");
}
