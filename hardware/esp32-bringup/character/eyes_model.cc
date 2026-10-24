#include "eyes_model.h"
#include "eye_poses.h"
#include <algorithm>
#include <cmath>
namespace round_eyes {
EyesModel::EyesModel(uint32_t seed) : random_(seed?seed:1), current_(GetPose(0)), facing_(GetPoseFacing(0)) {}
uint32_t EyesModel::NextRandom(){random_^=random_<<13;random_^=random_>>17;random_^=random_<<5;return random_;}
void EyesModel::SetEmotion(std::string_view key,uint64_t now) {
    uint8_t id=0; for(size_t i=0;i<kEmotions.size();++i)if(key==kEmotions[i].key)id=i;
    if(id!=emotion_){emotion_=id;pose_at_=now;}
}
void EyesModel::SetBehavior(Behavior b,uint64_t now) {if(b!=behavior_){behavior_=b;pose_at_=now;energy_=0;}}
void EyesModel::ForcePose(std::optional<uint8_t> p,uint64_t now) {if(p&&*p>=kPoseCount)return;forced_=p;pose_at_=now;}
void EyesModel::ObserveAudio(float e,uint64_t now){energy_=std::isfinite(e)?std::clamp(e,0.f,1.f):0;audio_at_=now;}
Frame EyesModel::Tick(uint64_t now) {
    // A backwards timestamp must return precisely the last rendered geometry.
    const bool backwards=started_&&now<last_;
    if(backwards)now=last_;
    const uint64_t previous_at=last_;
    const float frame_dt=started_?float(now-last_)*.001f:0;
    const bool motion_changed=motion_.active&&motion_.key!=motion_key_;
    if(motion_changed){motion_key_=motion_.key;motion_at_=now;}
    const uint64_t origin=motion_.active?motion_at_:pose_at_;
    const uint64_t age=now>=origin?now-origin:0;
    const auto& list=kEmotions[motion_.active?motion_.emotion:emotion_];
    uint8_t selected=list.ids[(age/list.cycle_ms)%list.count];
    const bool gesturing=motion_.active&&motion_.gesture!=HeadGesture::None;
    if((motion_.active?motion_.emotion:emotion_)==0){
        selected=0;
        if(behavior_==Behavior::Waiting)selected=(age/5200)%2?14:8;
        if(behavior_==Behavior::Reconnecting)selected=(age/5200)%2?9:12;
        if(behavior_==Behavior::Waking)selected=1;
    }
    if(behavior_==Behavior::Listening&&!motion_.active)selected=(age/5000)%2?33:10;
    if(gesturing)selected=list.ids[0];
    pose_=forced_.value_or(selected);
    Pose target=GetPose(pose_);
    Facing target_facing=GetPoseFacing(pose_);
    if(gesturing)target_facing={};
    if(!forced_&&!motion_.active&&emotion_==0&&behavior_==Behavior::Idle){
        static constexpr float idle_yaw[]={.20f,.04f,-.24f,.04f};
        target_facing.yaw=idle_yaw[(age/6500)%4];
    }
    if(motion_.active){if(std::abs(motion_.look_x)>.001f)target_facing.yaw=motion_.look_x*.55f;if(std::abs(motion_.look_y)>.001f)target_facing.pitch=-motion_.look_y*.36f;}
    if(!forced_&&!gesturing){target_facing.yaw+=.035f*std::sin(float(age%30000)*.0008f+pose_*.7f);target_facing.pitch+=.02f*std::sin(float(age%25000)*.0006f);}
    target_facing.yaw=std::clamp(target_facing.yaw,-.65f,.65f);
    target_facing.pitch=std::clamp(target_facing.pitch,-.38f,.38f);
    target_facing.roll=std::clamp(target_facing.roll,-.30f,.30f);
    if(!started_){started_=true;last_=now;blink_at_=now+3500;}
    if(motion_changed&&motion_.blink_once)blink_at_=now;
    if(now>=blink_at_+240)blink_at_=now+static_cast<uint64_t>(((behavior_==Behavior::Listening?5000:3000)+NextRandom()%4000)/(motion_.active?std::max(.1f,motion_.blink):1.f));
    float blink=1;
    if(!forced_&&(!motion_.active||motion_.blink>0||motion_.blink_once)&&now>=blink_at_){float t=float(now-blink_at_);blink=t<70?1-t/70:std::min(1.f,(t-70)/170);}
    const float audio=(!motion_.active&&behavior_==Behavior::Speaking&&now>=audio_at_&&now-audio_at_<160)?energy_:0;
    for(auto& e:target){
        e.height*=1+.12f*audio;
        if(motion_.active){e.width*=motion_.scale;e.height*=motion_.scale;}
        if(!forced_&&!gesturing){
            e.x+=1.6f*std::sin(float(now%20000)*.0007f);e.y+=.7f*std::sin(float(now%17000)*.001f);
            if(behavior_==Behavior::Listening&&!motion_.active)e.y-=3;
            if(behavior_==Behavior::Waiting&&!motion_.active)e.y-=5;
            if(behavior_==Behavior::Reconnecting&&!motion_.active)e.x+=5*std::sin(float(age%10000)*.0008f);
        }
    }
    float remaining=float(std::min<uint64_t>(now-last_,250))*.001f;
    while(remaining>0){
        float dt=std::min(.016f,remaining);remaining-=dt;
        float omega=motion_.active?std::clamp(4000.f/motion_.transition_ms,5.f,30.f):12.f;
        if((head_was_active_&&!gesturing)||head_carry_active_)omega=std::min(omega,6.f);
        auto spring=[dt,omega](float& x,float& v,float goal){float a=omega*omega*(goal-x)-2*omega*v;v+=a*dt;x+=v*dt;};
        spring(projection_radius_,radius_velocity_,GetPoseRadius(pose_));
        spring(extent_,extent_velocity_,GetPoseExtent(pose_));
        spring(facing_.yaw,facing_velocity_.yaw,target_facing.yaw);
        spring(facing_.pitch,facing_velocity_.pitch,target_facing.pitch);
        spring(facing_.roll,facing_velocity_.roll,target_facing.roll);
        for(size_t i=0;i<2;++i){
            auto& c=current_[i];auto& v=velocity_[i];auto& t=target[i];
            spring(c.x,v.x,t.x);spring(c.y,v.y,t.y);spring(c.width,v.width,t.width);
            spring(c.height,v.height,t.height);spring(c.angle,v.angle,t.angle);
            spring(c.bend,v.bend,t.bend);spring(c.power,v.power,t.power);
        }
    }
    motion_shake_+=( (motion_.active?motion_.shake:0)-motion_shake_)*std::min(1.f,float(now-last_)/150.f);
    last_=now;
    Frame f;f.pose=pose_;f.behavior=behavior_;
    // A giant eye covers a broad arc; constrain rotation to keep its contour on the visible hemisphere.
    const float giant=std::clamp((extent_-77.f)/40.f,0.f,1.f);
    const float gesture=gesturing?HeadGestureValue(motion_.gesture,age,motion_.gesture_duration_ms)*(1-.7f*giant):0;
    const bool nod=motion_.gesture==HeadGesture::Nod;
    // A new utterance may interrupt mid-swing: carry its position and velocity
    // into a critically damped return instead of dropping the offset to zero.
    if(motion_changed||(!gesturing&&head_was_active_)){
        head_carry_=head_offset_;head_carry_velocity_=head_velocity_;head_carry_at_=previous_at;
        head_carry_active_=std::abs(head_offset_.yaw)+std::abs(head_offset_.pitch)+std::abs(head_offset_.roll)+std::abs(head_velocity_.yaw)+std::abs(head_velocity_.pitch)+std::abs(head_velocity_.roll)>.00001f;
    }
    Facing offset{!nod?.38f*gesture:0,nod?-.25f*gesture:0,!nod?-.035f*gesture:0};
    if(head_carry_active_){
        const float t=float(now-head_carry_at_)*.001f,decay=std::exp(-12.f*t);
        auto carry=[t,decay](float x,float v){return (x+(v+12*x)*t)*decay;};
        offset.yaw+=carry(head_carry_.yaw,head_carry_velocity_.yaw);offset.pitch+=carry(head_carry_.pitch,head_carry_velocity_.pitch);offset.roll+=carry(head_carry_.roll,head_carry_velocity_.roll);
        if(t>1.5f)head_carry_active_=false;
    }
    if(frame_dt>0)head_velocity_={(offset.yaw-head_offset_.yaw)/frame_dt,(offset.pitch-head_offset_.pitch)/frame_dt,(offset.roll-head_offset_.roll)/frame_dt};
    head_offset_=offset;head_was_active_=gesturing;
    const float yaw=std::clamp(facing_.yaw+offset.yaw,-(.65f-.49f*giant),.65f-.49f*giant);
    const float pitch=std::clamp(facing_.pitch+offset.pitch,-(.38f-.26f*giant),.38f-.26f*giant);
    const float roll=facing_.roll+offset.roll;
    const float cy=std::cos(yaw),sy=std::sin(yaw),cp=std::cos(pitch),sp=std::sin(pitch),cr=std::cos(roll),sr=std::sin(roll);
    float max_y=1;
    for(size_t e=0;e<2;++e){auto p=current_[e];
        const float elastic=std::min(1.f,(offset.yaw/.38f)*(offset.yaw/.38f)+(offset.pitch/.25f)*(offset.pitch/.25f));p.width*=1+.025f*elastic;p.height*=1-.045f*elastic;
        p.x+=motion_shake_*3.2f*std::sin(float(now%10000)*.045f);p.y+=motion_shake_*2.3f*std::sin(float(now%10000)*.057f);
        float wake=behavior_==Behavior::Waking?std::min(1.f,.45f+float(age)*.55f/300):1.f;
        p.height=std::max(5.f,p.height*blink*wake);
        const float radius=std::min(p.width,p.height)*.5f;
        const float span_x=std::max(0.f,(p.width-p.height)*.5f),span_y=std::max(0.f,(p.height-p.width)*.5f);
        const float capsule=std::clamp((p.power-2.f)*.5f,0.f,1.f);
        for(size_t i=0;i<kContourPoints;++i){float theta=float(i)*6.28318530718f/kContourPoints;
            float co=std::cos(theta),si=std::sin(theta);
            const float pill_x=co*radius+(i<12||i>=36?span_x:-span_x),pill_y=si*radius+(i<24?span_y:-span_y);
            float x=co*p.width*.5f*(1-capsule)+pill_x*capsule;
            float y=si*p.height*.5f*(1-capsule)+pill_y*capsule;
            float px=(p.x+x*std::cos(p.angle)-y*std::sin(p.angle)-120)/projection_radius_;
            float py=(p.y+x*std::sin(p.angle)+y*std::cos(p.angle)-120)/projection_radius_;
            const float length=std::sqrt(px*px+py*py);if(length>.94f){px*=.94f/length;py*=.94f/length;}
            const float pz=std::sqrt(std::max(0.f,1-px*px-py*py));
            const float tx=px*cy+pz*sy,tz=pz*cy-px*sy,ty=py*cp-tz*sp;
            const float out_x=(tx*cr-ty*sr)*projection_radius_,out_y=(tx*sr+ty*cr)*projection_radius_;
            f.eyes[e][i]={120+out_x,120+out_y};max_y=std::max(max_y,std::abs(out_y));
        }
    }
    // Fit the complete silhouette, preserving curves rather than clipping vertices.
    const float fit=std::min(1.f,extent_/max_y);
    if(fit<1)for(auto& eye:f.eyes)for(auto& p:eye){p.x=120+(p.x-120)*fit;p.y=120+(p.y-120)*fit;}
    return f;
}
const char* BehaviorName(Behavior b){static const char* names[]={"idle","waking","listening","waiting","speaking","reconnecting"};return names[static_cast<unsigned>(b)<6?static_cast<unsigned>(b):0];}
}
