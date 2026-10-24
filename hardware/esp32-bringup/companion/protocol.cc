#include "protocol.h"
#include "../character/emotion_keys.h"
#include <cstring>
namespace companion {
static uint32_t U32(const uint8_t* b){return uint32_t(b[0])|(uint32_t(b[1])<<8)|(uint32_t(b[2])<<16)|(uint32_t(b[3])<<24);}
static uint16_t U16(const uint8_t* b){return uint16_t(b[0])|(uint16_t(b[1])<<8);}
bool DecodeAudio(const uint8_t* b,size_t n,AudioHeader& h){
 if(!b||n<24||n>984||(n&1)||memcmp(b,"REYE",4)||b[4]!=1||(b[5]&~1)||U16(b+6)!=24||U16(b+20)!=n-24||b[23]!=1||(b[22]!=16&&b[22]!=24))return false;
 h={U32(b+8),U32(b+12),U32(b+16),U16(b+20),b[22],bool(b[5]&1)};return true;
}
bool ValidReaction(const char* value,uint32_t hold){
 if(!value||hold<300||hold>3000)return false;
 for(auto key:round_eyes::kEmotionKeys){if(!strcmp(key,value))return true;}
 return false;
}
}
