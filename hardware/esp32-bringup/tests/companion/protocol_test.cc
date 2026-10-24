#include "protocol.h"
#include "../../character/emotion_keys.h"
#include <cassert>
#include <fstream>
#include <string>
#include <vector>
int main(int argc,char** argv){
 using namespace companion;
 assert(!Expired(0xfffffff0,0x10));assert(Expired(0x11,0x10));
 const uint8_t bytes[]={82,69,89,69,1,1,24,0,1,0,0,0,2,0,0,0,3,0,0,0,2,0,16,1,52,18};
 assert(argc==2);std::ifstream file(argv[1]);std::string hex;file>>hex;assert(hex.size()==52);std::vector<uint8_t> golden;for(size_t i=0;i<hex.size();i+=2)golden.push_back(static_cast<uint8_t>(std::stoul(hex.substr(i,2),nullptr,16)));for(size_t i=0;i<golden.size();i++)assert(golden[i]==bytes[i]);
 AudioHeader h{};assert(DecodeAudio(bytes,sizeof(bytes),h));assert(h.stream_id==1&&h.turn_seq==3&&h.payload_len==2&&h.end);
 assert(!DecodeAudio(bytes,sizeof(bytes)-1,h));
 assert(ValidReaction("relaxed",1600));assert(!ValidReaction("shell",1600));assert(!ValidReaction("happy",3001));
 for(auto key:round_eyes::kEmotionKeys){assert(ValidReaction(key,300));assert(ValidReaction(key,3000));assert(!ValidReaction(key,299));}
}
