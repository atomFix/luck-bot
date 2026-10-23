#include "session.h"
#include <cassert>
int main(){using namespace companion;Session s("boot");
 assert(s.Authenticate("a",15,100)==Result::ok);assert(s.Authenticate("b",15,101)==Result::busy);
 Command c{"boot",s.id(),"cmd",1,1,2000,Scope::reaction};
 assert(s.Accept(c,110)==Result::ok);assert(s.Accept(c,111)==Result::duplicate);
 auto old=c;old.id="other";old.boot="old";assert(s.Accept(old,112)==Result::stale);
 old=c;old.id="expired";old.seq=2;old.deadline=100;assert(s.Accept(old,113)==Result::expired);
 old=c;old.id="next";old.seq=2;old.turn=2;assert(s.Accept(old,114)==Result::ok);
 old=c;old.id="stale-turn";old.seq=3;assert(s.Accept(old,115)==Result::stale);
 assert(s.Authenticate("b",1,15100)==Result::ok);
 old.boot="boot";old.session=s.id();old.seq=1;old.turn=1;old.deadline=16000;old.required=Scope::voice;
 assert(s.Accept(old,15101)==Result::forbidden);
 auto turn=s.BeginVoiceTurn(15101);assert(turn==1);assert(s.BeginVoiceTurn(15102)==2);
 s.Revoke("b");assert(!s.Active(15102));
}
