#include "pairing.h"
#include <cassert>
int main(){using namespace companion;Pairing p;
 assert(!p.ConfirmBootClick(0));assert(!p.Begin(false,false,false,0));
 assert(p.Begin(true,true,true,10));assert(p.ConfirmBootClick(20));assert(!p.ConfirmBootClick(21));
 assert(p.Begin(true,true,true,100));assert(!p.ConfirmBootClick(30101));
 assert(p.Begin(true,true,true,0xfffffff0));assert(p.ConfirmBootClick(0x10));
}
