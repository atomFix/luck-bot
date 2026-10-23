#include "triangulate.h"
#include <cmath>
namespace round_eyes {
static float Cross(Point a,Point b,Point c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
Mesh Triangulate(const Contour& p){
    Mesh result;std::array<uint8_t,kContourPoints> indices{};
    for(size_t i=0;i<p.size();++i){if(!std::isfinite(p[i].x)||!std::isfinite(p[i].y))return {};indices[i]=i;}
    size_t count=p.size();
    while(count>2){bool found=false;
        for(size_t i=0;i<count;++i){auto a=p[indices[(i+count-1)%count]],b=p[indices[i]],c=p[indices[(i+1)%count]];
            if(Cross(a,b,c)<=0.00001f)continue;
            bool inside=false;
            for(size_t j=0;j<count;++j){if(j==i||j==(i+count-1)%count||j==(i+1)%count)continue;
                auto q=p[indices[j]];
                if(Cross(a,b,q)>=0&&Cross(b,c,q)>=0&&Cross(c,a,q)>=0){inside=true;break;}
            }
            if(inside)continue;
            result.triangles[result.count++]={a,b,c};
            for(size_t j=i;j+1<count;++j)indices[j]=indices[j+1];
            --count;found=true;break;
        }
        if(!found)return {}; // Fail closed on malformed or degenerate input.
    }
    return result;
}
}
