#include "character/eyes_model.h"
#include "character/timeline.h"
#include <cassert>
#include <cmath>
#include <cstdio>
using namespace round_eyes;
int main(){AnimationTrack track;AnimationPlan p;p.count=3;p.steps[0].duration_ms=500;p.steps[0].motion.emotion=20;p.steps[1].duration_ms=1000;p.steps[1].motion={true,10,.5f,-.4f,.75f,.9f,2,150};p.steps[2].duration_ms=1200;
 assert(ValidAnimation(p));assert(track.Start(p,100));assert(track.Read(100).emotion==20);assert(track.Read(599).emotion==20);assert(track.Read(600).emotion==10);assert(track.Read(1600).emotion==0);assert(!track.Read(2800).active);
 EyesModel model(42);model.SetBehavior(Behavior::Listening,0);model.SetEmotion("happy",0);
 for(uint64_t t=100;t<3000;t+=20){model.SetMotion(track.Read(t));const auto f=model.Tick(t);if(t<1600)assert(f.pose!=10);for(auto& eye:f.eyes)for(auto q:eye){assert(std::isfinite(q.x)&&std::isfinite(q.y));assert(q.x>10&&q.x<230&&q.y>35&&q.y<200);}}
 p.steps[0].motion.shake=NAN;assert(!track.Start(p,3000));p.steps[0].motion.shake=0;p.count=13;assert(!ValidAnimation(p));p.count=3;p.steps[0].duration_ms=199;assert(!ValidAnimation(p));p.steps[0].duration_ms=500;p.steps[0].motion.scale=2;assert(!ValidAnimation(p));p.steps[0].motion.scale=1;assert(track.Start(p,4000));track.Clear();assert(!track.Read(4001).active);
 AnimationPlan blink;blink.count=1;blink.steps[0].duration_ms=1000;blink.steps[0].motion.blink_once=true;blink.steps[0].motion.blink=0;AnimationTrack blinking;assert(blinking.Start(blink,0));EyesModel eyes(7);eyes.SetMotion(blinking.Read(0));
 auto height=[](const Frame& f){float low=1000,high=-1000;for(auto q:f.eyes[0]){low=std::min(low,q.y);high=std::max(high,q.y);}return high-low;};
 const float opened=height(eyes.Tick(0)),closed=height(eyes.Tick(70)),reopened=height(eyes.Tick(250));assert(closed<opened*.4f);assert(reopened>opened*.8f);
 std::puts("PASS animation timeline: boundaries, replacement, expiration, listening priority and bounded geometry");}
