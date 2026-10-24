#include "eyes_model.h"
#include "eye_poses.h"
#include <algorithm>
#include <cmath>
namespace round_eyes {
EyesModel::EyesModel(uint32_t seed) : random_(seed?seed:1), current_(GetPose(0)) {}
uint32_t EyesModel::NextRandom(){random_^=random_<<13;random_^=random_>>17;random_^=random_<<5;return random_;}
void EyesModel::SetEmotion(std::string_view key,uint64_t now) {
    uint8_t id=0; for(size_t i=0;i<kEmotions.size();++i)if(key==kEmotions[i].key)id=i;
    if(id!=emotion_){emotion_=id;pose_at_=now;}
}
void EyesModel::SetBehavior(Behavior b,uint64_t now) {if(b!=behavior_){behavior_=b;pose_at_=now;energy_=0;}}
void EyesModel::ForcePose(std::optional<uint8_t> p,uint64_t now) {if(p&&*p>=25)return;forced_=p;pose_at_=now;}
void EyesModel::ObserveAudio(float e,uint64_t now){energy_=std::isfinite(e)?std::clamp(e,0.f,1.f):0;audio_at_=now;}
Frame EyesModel::Tick(uint64_t now) {
    // A backwards timestamp must return precisely the last rendered geometry.
    const bool backwards=started_&&now<last_;
    if(backwards)now=last_;
    const bool motion_changed=motion_.active&&motion_.key!=motion_key_;
    if(motion_changed){motion_key_=motion_.key;motion_at_=now;}
    const uint64_t origin=motion_.active?motion_at_:pose_at_;
    const uint64_t age=now>=origin?now-origin:0;
    const auto& list=kEmotions[motion_.active?motion_.emotion:emotion_];
    uint8_t selected=list.ids[(age/list.cycle_ms)%list.count];
    if((motion_.active?motion_.emotion:emotion_)==0){
        selected=0;
        if(behavior_==Behavior::Waiting)selected=(age/5200)%2?14:8;
        if(behavior_==Behavior::Reconnecting)selected=(age/5200)%2?9:12;
        if(behavior_==Behavior::Waking)selected=1;
    }
    if(behavior_==Behavior::Listening&&!motion_.active)selected=10;
    pose_=forced_.value_or(selected);
    Pose target=GetPose(pose_);
    if(!started_){started_=true;last_=now;blink_at_=now+3500;}
    if(motion_changed&&motion_.blink_once)blink_at_=now;
    if(now>=blink_at_+240)blink_at_=now+static_cast<uint64_t>(((behavior_==Behavior::Listening?5000:3000)+NextRandom()%4000)/(motion_.active?std::max(.1f,motion_.blink):1.f));
    float blink=1;
    if(!forced_&&(!motion_.active||motion_.blink>0||motion_.blink_once)&&now>=blink_at_){float t=float(now-blink_at_);blink=t<70?1-t/70:std::min(1.f,(t-70)/170);}
    const float audio=(!motion_.active&&behavior_==Behavior::Speaking&&now>=audio_at_&&now-audio_at_<160)?energy_:0;
    for(auto& e:target){
        e.height*=1+.12f*audio;
        if(motion_.active){e.x+=motion_.look_x*18;e.y+=motion_.look_y*12;e.width*=motion_.scale;e.height*=motion_.scale;}
        if(!forced_){
            e.x+=1.6f*std::sin(float(now%20000)*.0007f);e.y+=.7f*std::sin(float(now%17000)*.001f);
            if(behavior_==Behavior::Listening&&!motion_.active)e.y-=3;
            if(behavior_==Behavior::Waiting&&!motion_.active)e.y-=5;
            if(behavior_==Behavior::Reconnecting&&!motion_.active)e.x+=5*std::sin(float(age%10000)*.0008f);
        }
    }
    float remaining=float(std::min<uint64_t>(now-last_,250))*.001f;
    while(remaining>0){
        float dt=std::min(.016f,remaining);remaining-=dt;
        for(size_t i=0;i<2;++i){
            const float omega=motion_.active?std::clamp(4000.f/motion_.transition_ms,5.f,30.f):15.f;
            auto spring=[dt,omega](float& x,float& v,float goal){float a=omega*omega*(goal-x)-2*omega*v;v+=a*dt;x+=v*dt;};
            auto& c=current_[i];auto& v=velocity_[i];auto& t=target[i];
            spring(c.x,v.x,t.x);spring(c.y,v.y,t.y);spring(c.width,v.width,t.width);
            spring(c.height,v.height,t.height);spring(c.angle,v.angle,t.angle);
            spring(c.bend,v.bend,t.bend);spring(c.power,v.power,t.power);
        }
    }
    motion_shake_+=( (motion_.active?motion_.shake:0)-motion_shake_)*std::min(1.f,float(now-last_)/150.f);
    last_=now;
    Frame f;f.pose=pose_;f.behavior=behavior_;
    for(size_t e=0;e<2;++e){auto p=current_[e];
        p.x+=motion_shake_*4.8f*std::sin(float(now%10000)*.045f);p.y+=motion_shake_*3.2f*std::sin(float(now%10000)*.057f);
        float wake=behavior_==Behavior::Waking?std::min(1.f,.45f+float(age)*.55f/300):1.f;
        p.height=std::max(5.f,p.height*blink*wake);
        for(size_t i=0;i<kContourPoints;++i){float theta=float(i)*6.28318530718f/kContourPoints;
            float co=std::cos(theta),si=std::sin(theta),power=2/std::clamp(p.power,2.f,4.f);
            float u=std::copysign(std::pow(std::abs(co),power),co);
            float x=u*p.width*.5f,y=std::copysign(std::pow(std::abs(si),power),si)*std::max(4.f,p.height)*.5f+p.bend*(1-u*u);
            f.eyes[e][i]={p.x+x*std::cos(p.angle)-y*std::sin(p.angle),p.y+x*std::sin(p.angle)+y*std::cos(p.angle)};
        }
    }
    return f;
}
const char* BehaviorName(Behavior b){static const char* names[]={"idle","waking","listening","waiting","speaking","reconnecting"};return names[static_cast<unsigned>(b)<6?static_cast<unsigned>(b):0];}
}
