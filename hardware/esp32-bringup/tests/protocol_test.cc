#include "preview/protocol.h"
#include <cassert>
#include <cstdio>
int main(){round_eyes::EyesModel m(1);
 for(auto c:{"pose 24","pose auto","emotion happy","behavior listening","energy 0.5"})assert(round_eyes::Control(m,c,0));
 for(auto c:{"pose 25","pose -1","pose 999999999999","energy nan","energy inf","energy 2","behavior junk","quit now","pose 1 extra",""})assert(!round_eyes::Control(m,c,0));
 puts("PASS host protocol: valid commands accepted; malformed and nonfinite rejected");}
