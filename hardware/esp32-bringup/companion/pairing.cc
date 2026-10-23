#include "pairing.h"
#include "protocol.h"
namespace companion {
bool Pairing::Begin(bool ready,bool idle,bool connected,uint32_t now){if(!ready||!idle||!connected||Pending(now))return false;pending_=true;deadline_=now+30000;return true;}
bool Pairing::Pending(uint32_t now){if(pending_&&Expired(now,deadline_))pending_=false;return pending_;}
bool Pairing::ConfirmBootClick(uint32_t now){if(!Pending(now))return false;pending_=false;return true;}
}
