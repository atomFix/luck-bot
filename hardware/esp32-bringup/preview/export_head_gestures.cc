#include "character/head_gesture.h"
#include <cstdio>
int main(){std::printf("[");for(unsigned t=0;t<=4200;t+=40){if(t)std::printf(",");std::printf("[%u,%.8f]",t,round_eyes::HeadGestureValue(round_eyes::HeadGesture::Nod,t,4200));}std::printf("]\n");}
