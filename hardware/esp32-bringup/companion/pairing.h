#pragma once
#include <cstdint>
namespace companion {
class Pairing {public:
 bool Begin(bool ready,bool idle,bool connected,uint32_t now);
 bool ConfirmBootClick(uint32_t now);
 bool Pending(uint32_t now);
 void Cancel(){pending_=false;}
 private:bool pending_=false;uint32_t deadline_=0;
};
}
