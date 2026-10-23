#include "character/rasterize.h"
#include <array>
#include <cstdio>
using namespace round_eyes;
int main(){
 std::array<std::array<uint16_t,kRasterPixels>,25> images{};
 for(uint8_t pose=0;pose<25;++pose){EyesModel model(42);model.ForcePose(pose,0);Frame f;for(int t=0;t<=1600;t+=40)f=model.Tick(t);Rasterize(f,{0,0,239,239},images[pose].data());}
 std::printf("P6\n1200 1200\n255\n");
 for(int y=0;y<1200;++y)for(int x=0;x<1200;++x){int local=y%240;uint16_t p=local>=kRasterTop&&local<kRasterTop+kRasterHeight?images[(y/240)*5+x/240][(local-kRasterTop)*240+x%240]:0;uint8_t rgb[]={uint8_t(((p>>11)&31)*255/31),uint8_t(((p>>5)&63)*255/63),uint8_t((p&31)*255/31)};std::fwrite(rgb,1,3,stdout);}
}
