#include "character/triangulate.h"
#include <cmath>
#include <cstdio>
#include <cstdlib>
using namespace round_eyes;
#define CHECK(x) do{if(!(x)){std::fprintf(stderr,"FAIL line %d: %s\n",__LINE__,#x);std::exit(1);}}while(0)
float Cross(Point a,Point b,Point c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
int main(){
 for(int a=0;a<25;++a)for(int b=0;b<25;++b){
  EyesModel m(42);m.ForcePose(a,0);m.Tick(0);m.Tick(1000);m.ForcePose(b,1000);
  for(int t=1000;t<2200;t+=40)for(auto& p:m.Tick(t).eyes){
   double area=0;for(size_t i=0;i<p.size();++i){auto q=p[(i+1)%p.size()];area+=p[i].x*q.y-q.x*p[i].y;}
   // Every pair of non-neighbor edges must remain disjoint throughout interpolation.
   for(size_t i=0;i<p.size();++i)for(size_t j=i+2;j<p.size();++j){
    if(i==0&&j==p.size()-1)continue;
    auto u=p[i],v=p[(i+1)%p.size()],w=p[j],z=p[(j+1)%p.size()];
    CHECK(!(Cross(u,v,w)*Cross(u,v,z)<0&&Cross(w,z,u)*Cross(w,z,v)<0));
   }
   auto mesh=Triangulate(p);CHECK(mesh.count==46);double triangles=0;
   for(size_t i=0;i<mesh.count;++i){auto tr=mesh.triangles[i];float c=Cross(tr.a,tr.b,tr.c);CHECK(c>0);triangles+=c;}
   CHECK(std::abs(triangles-area)<.1);
  }
 }
 Contour invalid{};CHECK(Triangulate(invalid).count==0);
 std::puts("PASS triangulation: all transitions simple, 46 positive triangles, conserved area");
}
