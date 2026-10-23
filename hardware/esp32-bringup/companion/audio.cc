#include "audio.h"
#include <cstring>
#include <cstdlib>
namespace companion {
void Capture::Begin(uint32_t turn){turn_=turn;seq_=samples_=silence_=0;heard_=false;active_=true;}
void Capture::Cancel(){active_=false;}
bool Capture::Feed(const int16_t* pcm,size_t count,PcmFrame& out){
 if(!active_||count!=320)return false;
 uint32_t energy=0;for(size_t i=0;i<count;i++)energy+=std::abs(int(pcm[i]));
 bool voice=energy/count>600;heard_=heard_||voice;silence_=voice?0:silence_+count;samples_+=count;
 bool end=(heard_&&silence_>=9600)||samples_>=480000||(!heard_&&samples_>=160000);
 auto& b=out.data;b.fill(0);memcpy(b.data(),"REYE",4);b[4]=1;b[5]=end?1:0;b[6]=24;
 auto put=[&b](size_t i,uint32_t x){for(int j=0;j<4;j++)b[i+j]=uint8_t(x>>(8*j));};
 put(8,turn_);put(12,seq_++);put(16,turn_);b[20]=128;b[21]=2;b[22]=16;b[23]=1;memcpy(b.data()+24,pcm,640);out.size=664;if(end)active_=false;return true;
}
}
