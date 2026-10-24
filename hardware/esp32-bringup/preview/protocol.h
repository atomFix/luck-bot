#pragma once
#include "character/eyes_model.h"
#include <sstream>
#include <string>
#include <cmath>
namespace round_eyes {
inline bool Control(EyesModel& model,const std::string& line,uint64_t now){
 std::istringstream in(line);std::string op,value,extra;if(!(in>>op>>value)||(in>>extra))return false;
 if(op=="pose"){
  if(value=="auto"){model.ForcePose(std::nullopt,now);return true;}
  if(value.empty()||value.find_first_not_of("0123456789")!=std::string::npos||value.size()>2)return false;
  int p=std::stoi(value);if(p>=int(kPoseCount))return false;model.ForcePose(p,now);return true;
 }
 if(op=="emotion"){model.SetEmotion(value,now);return true;}
 if(op=="behavior"){for(int i=0;i<6;++i)if(value==BehaviorName(static_cast<Behavior>(i))){model.SetBehavior(static_cast<Behavior>(i),now);return true;}return false;}
 if(op=="energy"){try{size_t end;float e=std::stof(value,&end);if(end!=value.size()||!std::isfinite(e)||e<0||e>1)return false;model.ObserveAudio(e,now);return true;}catch(...){return false;}}
 return false;
}
}
