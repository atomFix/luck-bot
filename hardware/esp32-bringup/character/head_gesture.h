#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
namespace round_eyes {
enum class HeadGesture:uint8_t {None,Nod,HeadShake};
inline float GestureEase(float x){x=std::clamp(x,0.f,1.f);return x*x*x*(x*(x*6-15)+10);}
// One continuous trajectory, with zero position, velocity and acceleration at
// the entrance and exit. No timeline waypoints or per-beat braking.
inline float HeadGestureValue(HeadGesture gesture,uint64_t age,uint32_t duration){
 if(gesture==HeadGesture::None||duration<2800||age>=duration)return 0;
 const float u=(float(age)/duration-.08f)/.72f;
 if(u<=0||u>=1)return 0;
 const float envelope=GestureEase(u/.12f)*GestureEase((1-u)/.18f);
 return std::sin(12.56637061436f*u)*(1-.2f*u)*envelope;
}
}
