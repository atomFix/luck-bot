#include "character/eye_poses.h"
#include <cstdio>
using namespace round_eyes;
int main(){
 std::printf("{\"pose_count\":%zu,\"items\":[",kPoseCount);
 for(size_t n=0;n<kEmotions.size();++n){const auto& emotion=kEmotions[n];
  if(n)std::printf(",");std::printf("{\"key\":\"%s\",\"poses\":[",emotion.key);
  for(size_t j=0;j<emotion.count;++j){
   EyesModel model(42);model.ForcePose(emotion.ids[j],0);Frame frame;
   for(uint64_t t=0;t<=1600;t+=40)frame=model.Tick(t);
   if(j)std::printf(",");std::printf("{\"id\":%u,\"paths\":[",emotion.ids[j]);
   for(size_t eye=0;eye<2;++eye){if(eye)std::printf(",");std::printf("\"");
    for(size_t p=0;p<frame.eyes[eye].size();++p){const auto& point=frame.eyes[eye][p];std::printf("%c%.2f %.2f",p?'L':'M',point.x,point.y);}std::printf("Z\"");
   }std::printf("]}");
  }std::printf("]}");
 }std::printf("]}\n");
}
