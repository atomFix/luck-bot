#include "protocol.h"
#include <chrono>
#include <iostream>
#include <thread>
#include <poll.h>
#include <unistd.h>
int main(){
 using namespace round_eyes;EyesModel model(42);std::string pending;uint64_t tick=0;
 for(;;){auto deadline=std::chrono::steady_clock::now()+std::chrono::milliseconds(40);
  pollfd fd{STDIN_FILENO,POLLIN,0};
  while(poll(&fd,1,0)>0&&(fd.revents&POLLIN)){
   char buffer[512];ssize_t n=read(STDIN_FILENO,buffer,sizeof(buffer));if(n<=0)return 0;
   pending.append(buffer,n);size_t pos;
   while((pos=pending.find('\n'))!=std::string::npos){if(!Control(model,pending.substr(0,pos),tick))std::cerr<<"invalid control\n";pending.erase(0,pos+1);}
   if(pending.size()>4096)pending.clear();
  }
  auto f=model.Tick(tick);std::cout<<"{\"pose\":"<<int(f.pose)<<",\"behavior\":\""<<BehaviorName(f.behavior)<<"\",\"eyes\":[";
  for(size_t e=0;e<2;++e){if(e)std::cout<<',';std::cout<<'[';for(size_t i=0;i<48;++i){if(i)std::cout<<',';auto p=f.eyes[e][i];std::cout<<'['<<p.x<<','<<p.y<<']';}std::cout<<']';}
  std::cout<<"]}"<<std::endl;tick+=40;std::this_thread::sleep_until(deadline);
 }
}
