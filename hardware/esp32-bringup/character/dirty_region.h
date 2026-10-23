#pragma once
#include "eyes_model.h"
#include <algorithm>
#include <cmath>
namespace round_eyes {
struct Rect { int x1,y1,x2,y2; };
class DirtyRegion {
public:
 Rect Update(const Frame& frame){
  float x1=240,y1=240,x2=0,y2=0;
  for(auto& eye:frame.eyes)for(auto p:eye){x1=std::min(x1,p.x);y1=std::min(y1,p.y);x2=std::max(x2,p.x);y2=std::max(y2,p.y);}
  Rect next{std::max(0,int(std::floor(x1))-2),std::max(0,int(std::floor(y1))-2),std::min(239,int(std::ceil(x2))+2),std::min(239,int(std::ceil(y2))+2)};
  auto dirty=next;if(valid_){dirty.x1=std::min(next.x1,old_.x1);dirty.y1=std::min(next.y1,old_.y1);dirty.x2=std::max(next.x2,old_.x2);dirty.y2=std::max(next.y2,old_.y2);}
  old_=next;valid_=true;return dirty;
 }
private:Rect old_{};bool valid_=false;
};
}
