#include "layers.h"
#include <cassert>
int main(){using namespace companion;Layers l;
 assert(l.Put(1,"sad",1000,1,100));assert(l.Current(101)=="sad");
 assert(l.Put(0,"happy",500,2,200));assert(l.Current(300)=="happy");assert(!l.Put(2,"thinking",500,3,300));
 assert(l.Current(701)=="sad");l.ClearOlder(2);assert(l.Current(702)=="neutral");
 assert(l.Put(0,"happy",1000,2,702));l.ClearOlder(3);assert(l.Current(703)=="happy");assert(!l.Put(2,"thinking",500,3,703));
 l.SetCritical(true);assert(!l.Put(0,"happy",500,3,703));
}
