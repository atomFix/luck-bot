#include "audio.h"
#include "protocol.h"
#include <cassert>
int main(){using namespace companion;Capture c;PcmFrame f;int16_t loud[320],quiet[320]{};for(auto&x:loud)x=5000;
 c.Begin(7);assert(c.Feed(loud,320,f));AudioHeader h{};assert(DecodeAudio(f.data.data(),f.size,h));assert(h.turn_seq==7&&h.frame_seq==0&&h.rate==16);
 for(int i=0;i<29;i++){assert(c.Feed(quiet,320,f));assert(c.active());}
 assert(c.Feed(quiet,320,f));assert(!c.active());assert(DecodeAudio(f.data.data(),f.size,h)&&h.end);
 Receiver r;
 uint8_t raw[26]={82,69,89,69,1,0,24,0,1,0,0,0,0,0,0,0,7,0,0,0,2,0,24,1,0,0};
 AudioHeader down{};assert(DecodeAudio(raw,26,down));assert(r.Accept(down,7));assert(!r.Accept(down,7));down.frame_seq=2;assert(!r.Accept(down,7));r.Reset();down.frame_seq=0;assert(!r.Accept(down,8));
 c.Begin(8);c.Cancel();assert(!c.Feed(loud,320,f));
}
