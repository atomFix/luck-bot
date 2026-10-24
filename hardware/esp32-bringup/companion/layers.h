#pragma once
#include "protocol.h"
#include <array>
#include <string>
namespace companion {
class Layers {
 struct Layer {std::string emotion;uint32_t until=0,turn=0;bool active=false;};
 std::array<Layer,3> layers_{};bool critical_=false;
 public:
 void SetCritical(bool active){critical_=active;}
 void Clear(){layers_={};}
 bool ManualActive(uint32_t now){Current(now);return layers_[0].active;}
 void ClearOlder(uint32_t turn){for(size_t i=1;i<layers_.size();i++)if(layers_[i].turn<turn)layers_[i].active=false;}
 std::string Current(uint32_t now){for(auto& l:layers_){if(l.active&&Expired(now,l.until))l.active=false;if(l.active)return l.emotion;}return "neutral";}
 bool Put(size_t rank,const std::string& emotion,uint32_t hold,uint32_t turn,uint32_t now){
  if(critical_||rank>=layers_.size()||!ValidReaction(emotion.c_str(),hold))return false;
  Current(now);for(size_t i=0;i<rank;i++)if(layers_[i].active)return false;
  layers_[rank]={emotion,now+hold,turn,true};return true;
 }
};
}
