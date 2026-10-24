#include "audio.h"
#include <cstring>
namespace companion {
void Capture::Begin(uint32_t turn,bool host_endpoint){continuous_=false;stream_=turn;host_endpoint_=host_endpoint;turn_=turn;seq_=samples_=silence_=0;heard_=false;active_=true;}
void Capture::BeginAmbient(uint32_t stream){Begin(0,true);continuous_=true;stream_=stream;}
void Capture::Cancel(){active_=false;}
bool Capture::Feed(const int16_t* pcm,size_t count,PcmFrame& out,bool voice){
 if(!active_||count!=320)return false;
 if(!continuous_){heard_=heard_||voice;silence_=voice?0:silence_+count;samples_+=count;}
 bool end=!continuous_&&(samples_>=(host_endpoint_?1440000u:480000u)||(!host_endpoint_&&((heard_&&silence_>=9600)||(!heard_&&samples_>=160000))));
 auto& b=out.data;b.fill(0);memcpy(b.data(),"REYE",4);b[4]=1;b[5]=end?1:0;b[6]=24;
 auto put=[&b](size_t i,uint32_t x){for(int j=0;j<4;j++)b[i+j]=uint8_t(x>>(8*j));};
 put(8,stream_);put(12,seq_++);put(16,turn_);b[20]=128;b[21]=2;b[22]=16;b[23]=1;memcpy(b.data()+24,pcm,640);out.size=664;if(end)active_=false;return true;
}
}
