#include "rasterize.h"
#include <algorithm>
#include <cmath>
namespace round_eyes {
void Rasterize(const Frame& frame,Rect dirty,uint16_t* pixels){
 if(!pixels)return;
 dirty.x1=std::max(0,dirty.x1);dirty.x2=std::min(239,dirty.x2);dirty.y1=std::max(kRasterTop,dirty.y1);dirty.y2=std::min(kRasterTop+kRasterHeight-1,dirty.y2);
 // Sort edges once. Each scan then visits only its active edges instead of
 // rechecking all 48 vertices four times per row on a screen-filling eye.
 struct Edge {float low,high,x,slope;};
 std::array<std::array<Edge,kContourPoints>,2> edges;
 std::array<std::array<uint8_t,kContourPoints>,2> active;
 std::array<size_t,2> edge_count{},active_count{},next{};
 for(size_t eye=0;eye<2;eye++){
  const auto& contour=frame.eyes[eye];
  for(size_t i=0,j=kContourPoints-1;i<kContourPoints;j=i++){
   auto a=contour[i],b=contour[j];if(a.y==b.y)continue;
   if(a.y>b.y)std::swap(a,b);
   edges[eye][edge_count[eye]++]={a.y,b.y,a.x,(b.x-a.x)/(b.y-a.y)};
  }
  std::sort(edges[eye].begin(),edges[eye].begin()+edge_count[eye],[](const Edge& a,const Edge& b){return a.low<b.low;});
 }
 for(int y=dirty.y1;y<=dirty.y2;++y){
  // Difference coverage makes a solid interior O(1) per span, retaining exact
  // fractional edge coverage and all four vertical antialiasing samples.
  std::array<float,241> coverage{};
  for(int sample=0;sample<4;++sample)for(size_t eye=0;eye<2;eye++){
   const float scan=y+(sample+.5f)*.25f;std::array<float,48> intersections{};size_t count=0;
   while(next[eye]<edge_count[eye]&&edges[eye][next[eye]].low<=scan)active[eye][active_count[eye]++]=next[eye]++;
   for(size_t i=0;i<active_count[eye];){
    const auto& edge=edges[eye][active[eye][i]];
    if(scan>=edge.high){active[eye][i]=active[eye][--active_count[eye]];continue;}
    intersections[count++]=edge.x+(scan-edge.low)*edge.slope;++i;
   }
   std::sort(intersections.begin(),intersections.begin()+count);
   for(size_t i=0;i+1<count;i+=2){
    const float left=intersections[i],right=intersections[i+1];
    const int start=std::max(dirty.x1,int(std::floor(left))),end=std::min(dirty.x2,int(std::ceil(right))-1);
    if(start>end)continue;
    const auto add=[&](int x,float value){coverage[x]+=value;coverage[x+1]-=value;};
    add(start,.25f*std::max(0.f,std::min(right,float(start+1))-std::max(left,float(start))));
    if(end>start){
     add(end,.25f*std::max(0.f,std::min(right,float(end+1))-std::max(left,float(end))));
     if(end>start+1){coverage[start+1]+=.25f;coverage[end]-=.25f;}
    }
   }
  }
  float filled=0;
  for(int x=dirty.x1;x<=dirty.x2;++x){
   filled+=coverage[x];
   const uint16_t gray=static_cast<uint16_t>(std::clamp(filled,0.f,1.f)*255+.5f);
   pixels[(y-kRasterTop)*240+x]=((gray>>3)<<11)|((gray>>2)<<5)|(gray>>3);
  }
 }
}
}
