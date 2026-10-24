#include "audio.h"
#include "pcm_conditioner.h"
#include "protocol.h"
#include <cassert>
#include <cstdlib>
int main(){using namespace companion;
 DcBlocker blocker;
 for(int i=0;i<16000;i++)assert(blocker.Process(5000)==0);
 blocker.Reset();int64_t magnitude=0,sum=0;
 for(int i=0;i<16000;i++){const int16_t sample=5000+(i%80<40?1400:-1400);const int value=blocker.Process(sample);if(i>1600){magnitude+=std::abs(value);sum+=value;}}
 assert(magnitude/14399>1100);assert(std::abs(sum/14399)<20);
 Capture c;PcmFrame f;int16_t loud[320],quiet[320]{};for(auto&x:loud)x=5000;
 c.Begin(7);assert(c.Feed(loud,320,f,true));AudioHeader h{};assert(DecodeAudio(f.data.data(),f.size,h));assert(h.turn_seq==7&&h.frame_seq==0&&h.rate==16);
 for(int i=0;i<29;i++){assert(c.Feed(quiet,320,f,false));assert(c.active());}
 assert(c.Feed(quiet,320,f,false));assert(!c.active());assert(DecodeAudio(f.data.data(),f.size,h)&&h.end);
 Receiver r;
 uint8_t raw[26]={82,69,89,69,1,0,24,0,1,0,0,0,0,0,0,0,7,0,0,0,2,0,24,1,0,0};
 AudioHeader down{};assert(DecodeAudio(raw,26,down));assert(r.Accept(down,7));assert(!r.Accept(down,7));down.frame_seq=2;assert(!r.Accept(down,7));r.Reset();down.frame_seq=0;assert(!r.Accept(down,8));
 // A microphone may have a large DC bias even during silence. The AFE VAD
 // decision, rather than raw sample magnitude, determines the utterance end.
 c.Begin(9);assert(c.Feed(loud,320,f,true));
 for(int i=0;i<30;i++)assert(c.Feed(loud,320,f,false));
 assert(!c.active());assert(DecodeAudio(f.data.data(),f.size,h)&&h.end);
 c.Begin(10,true);assert(c.Feed(loud,320,f,true));
 for(int i=0;i<300;i++){assert(c.Feed(quiet,320,f,false));assert(c.active());}
 c.Begin(8);c.Cancel();assert(!c.Feed(loud,320,f,true));
}
