#include "character/dirty_region.h"
#include <cassert>
#include <cstdio>
using namespace round_eyes;
int main(){EyesModel m(42);DirtyRegion dirty;
 auto previous=m.Tick(0);
 for(size_t pose=0;pose<kPoseCount;++pose){m.ForcePose(pose,pose*2000);
  for(int t=0;t<1600;t+=40){auto frame=m.Tick(pose*2000+t);auto r=dirty.Update(frame);
   for(const auto& f:{previous,frame})for(auto& eye:f.eyes)for(auto p:eye)assert(p.x>=r.x1&&p.x<=r.x2&&p.y>=r.y1&&p.y<=r.y2);
   assert((r.x2-r.x1+1)*(r.y2-r.y1+1)<240*240/2);previous=frame;
  }
 }
 puts("PASS dirty region: clears old and new eyes across all poses, less than half-screen transfers");}
