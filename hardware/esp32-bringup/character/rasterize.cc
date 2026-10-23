#include "rasterize.h"
#include <algorithm>
#include <cmath>
namespace round_eyes {
void Rasterize(const Frame& frame,Rect dirty,uint16_t* pixels){
 if(!pixels)return;
 dirty.x1=std::max(0,dirty.x1);dirty.x2=std::min(239,dirty.x2);dirty.y1=std::max(kRasterTop,dirty.y1);dirty.y2=std::min(kRasterTop+kRasterHeight-1,dirty.y2);
 for(int y=dirty.y1;y<=dirty.y2;++y){
  std::array<float,240> coverage{};
  for(const auto& contour:frame.eyes)for(int sample=0;sample<4;++sample){
   const float scan=y+(sample+.5f)*.25f;std::array<float,48> intersections{};size_t count=0;
   for(size_t i=0,j=47;i<48;j=i++){
    auto a=contour[i],b=contour[j];if((a.y>scan)==(b.y>scan))continue;
    intersections[count++]=a.x+(scan-a.y)*(b.x-a.x)/(b.y-a.y);
   }
   std::sort(intersections.begin(),intersections.begin()+count);
   for(size_t i=0;i+1<count;i+=2){
    const float left=intersections[i],right=intersections[i+1];
    const int start=std::max(dirty.x1,int(std::floor(left))),end=std::min(dirty.x2,int(std::ceil(right))-1);
    for(int x=start;x<=end;++x)coverage[x]+=.25f*std::max(0.f,std::min(right,float(x+1))-std::max(left,float(x)));
   }
  }
  for(int x=dirty.x1;x<=dirty.x2;++x){
   const uint16_t gray=static_cast<uint16_t>(std::min(1.f,coverage[x])*255+.5f);
   pixels[(y-kRasterTop)*240+x]=((gray>>3)<<11)|((gray>>2)<<5)|(gray>>3);
  }
 }
}
}
