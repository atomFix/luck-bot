#include "character/rasterize.h"
#include <array>
#include <cassert>
#include <cmath>
#include <cstdio>
using namespace round_eyes;
static bool Inside(const Contour& p,float x,float y){bool in=false;for(size_t i=0,j=47;i<48;j=i++){auto a=p[i],b=p[j];if((a.y>y)!=(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)in=!in;}return in;}
static float Distance(const Contour& p,float x,float y){float nearest=10000;for(size_t i=0;i<48;++i){auto a=p[i],b=p[(i+1)%48];float dx=b.x-a.x,dy=b.y-a.y;float t=std::clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy),0.f,1.f);float u=x-a.x-t*dx,v=y-a.y-t*dy;nearest=std::min(nearest,std::sqrt(u*u+v*v));}return nearest;}
int main(){std::array<uint16_t,kRasterPixels> pixels{};DirtyRegion dirty;EyesModel model(42);
 for(int pose=0;pose<25;++pose){model.ForcePose(pose,pose*2000);Frame f;for(int t=0;t<=1600;t+=40){f=model.Tick(pose*2000+t);Rasterize(f,dirty.Update(f),pixels.data());}
  size_t white=0,gray=0;for(int y=0;y<240;++y)for(int x=0;x<240;++x){bool in=false;float distance=1000;for(auto& eye:f.eyes){in|=Inside(eye,x+.5f,y+.5f);distance=std::min(distance,Distance(eye,x+.5f,y+.5f));}
   uint16_t pixel=y>=kRasterTop&&y<kRasterTop+kRasterHeight?pixels[(y-kRasterTop)*240+x]:0;if(distance>1.5f)assert(pixel==(in?65535:0)); // Also proves all eye silhouettes fit inside the cropped canvas.
   white+=pixel==65535;gray+=pixel!=0&&pixel!=65535;
  }
  assert(white>20);assert(gray>10); // Closed eyes remain visible, edges antialiased.
 }
 puts("PASS rasterizer: all25 silhouettes solid, antialiased edges, previous shape cleared");
}
