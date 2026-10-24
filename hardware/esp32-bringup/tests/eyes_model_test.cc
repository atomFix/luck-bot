#include "character/eyes_model.h"
#include "character/eye_poses.h"
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <limits>
using namespace round_eyes;
#define CHECK(x) do { if (!(x)) { std::fprintf(stderr,"FAIL line %d: %s\n",__LINE__,#x); std::exit(1); } } while (0)
static double Area(const Contour& p) {
    double a = 0;
    for (size_t i=0; i<p.size(); ++i) { auto q=p[(i+1)%p.size()]; a+=p[i].x*q.y-q.x*p[i].y; }
    return a*.5;
}
static void Valid(const Frame& f) {
    for (const auto& eye:f.eyes) {
        CHECK(Area(eye)>1);
        for (auto p:eye) {
            CHECK(std::isfinite(p.x)&&std::isfinite(p.y));
            CHECK((p.x-120)*(p.x-120)+(p.y-120)*(p.y-120)<118*118);
        }
    }
}
static bool Same(const Frame& a,const Frame& b) {
    for(size_t e=0;e<2;++e) for(size_t i=0;i<kContourPoints;++i)
        if(a.eyes[e][i].x!=b.eyes[e][i].x||a.eyes[e][i].y!=b.eyes[e][i].y)return false;
    return a.pose==b.pose&&a.behavior==b.behavior;
}
int main() {
    for(const auto& emotion:kEmotions){EyesModel m(42);m.SetEmotion(emotion.key,0);CHECK(m.Tick(0).pose==emotion.ids[0]);}
    for(auto behavior:{Behavior::Listening,Behavior::Waiting,Behavior::Reconnecting}){
        EyesModel happy(42),angry(42);happy.SetEmotion("happy",0);angry.SetEmotion("angry",0);
        happy.SetBehavior(behavior,0);angry.SetBehavior(behavior,0);happy.Tick(0);angry.Tick(0);
        if(behavior==Behavior::Listening)CHECK(Same(happy.Tick(1000),angry.Tick(1000)));else CHECK(!Same(happy.Tick(1000),angry.Tick(1000)));
    }
    EyesModel blinking(42); Frame closed;
    for(uint64_t t=0;t<=3570;t+=10)closed=blinking.Tick(t);
    float lo=1000,hi=-1000;for(auto p:closed.eyes[0]){lo=std::fmin(lo,p.y);hi=std::fmax(hi,p.y);}
    CHECK(hi-lo<8); // A blink must really close, even though pose changes use springs.
    EyesModel a(42),b(42);
    Valid(a.Tick(0));
    a.SetEmotion("unknown",0); b.SetEmotion("neutral",0);
    for(uint64_t t=0;t<16000;t+=40) CHECK(Same(a.Tick(t),b.Tick(t)));
    for(uint8_t from=0;from<kPoseCount;++from) for(uint8_t to=0;to<kPoseCount;++to) {
        EyesModel m(1); m.ForcePose(from,0); m.Tick(0); m.Tick(1000);
        m.ForcePose(to,1000);
        for(uint64_t t=1000;t<2400;t+=20){auto f=m.Tick(t);CHECK(f.pose==to);Valid(f);}
    }
    a.ForcePose(24,17000);CHECK(a.Tick(17000).pose==24);
    a.ForcePose(kPoseCount,17000);CHECK(a.Tick(17040).pose==24);
    a.ForcePose(std::nullopt,18000);a.SetEmotion("angry",18000);CHECK(a.Tick(18000).pose==7);
    a.SetBehavior(Behavior::Listening,18100);CHECK(a.Tick(18100).behavior==Behavior::Listening);
    CHECK(a.Tick(18100).pose==10); // Listening overrides any previous emotion.
    a.SetBehavior(Behavior::Idle,18200);CHECK(a.Tick(18200).pose==7);
    EyesModel focus(1);focus.SetEmotion("neutral",0);for(uint64_t t=0;t<20000;t+=40)CHECK(focus.Tick(t).pose==0);
    for(const auto& emotion:kEmotions){EyesModel listening(2);listening.SetEmotion(emotion.key,0);listening.SetBehavior(Behavior::Listening,0);for(uint64_t t=0;t<12000;t+=40){auto pose=listening.Tick(t).pose;CHECK(pose==10||pose==33);}}
    auto old=a.Tick(20000);CHECK(Same(old,a.Tick(19000)));
    a.ObserveAudio(std::numeric_limits<float>::quiet_NaN(),21000);
    a.ObserveAudio(std::numeric_limits<float>::infinity(),21000);
    Valid(a.Tick(900000));
    a.SetEmotion("sleepy",900000);a.ForcePose(13,900000);Valid(a.Tick(900500));
    std::puts("PASS eyes model: all pose transitions, safety, deterministic motion, fallback, timing and interruption");
}
