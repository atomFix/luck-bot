#include "session.h"
#include "protocol.h"
namespace companion {
bool Session::Active(uint32_t now){if(!controller_.empty()&&Expired(now,until_))Release();return !controller_.empty();}
void Session::Release(){controller_.clear();session_.clear();scopes_=0;seq_=turn_=0;seen_={};cursor_=0;}
void Session::Revoke(const std::string& controller){if(controller==controller_)Release();}
Result Session::Authenticate(const std::string& controller,uint8_t scopes,uint32_t now){
 if(Active(now))return Result::busy;
 controller_=controller;scopes_=scopes;session_=boot_+"-"+std::to_string(++generation_);until_=now+15000;return Result::ok;
}
bool Session::Heartbeat(uint32_t now){if(!Active(now))return false;until_=now+15000;return true;}
Result Session::Accept(const Command& c,uint32_t now){
 if(!Active(now))return Result::unauthorized;
 if(c.boot!=boot_||c.session!=session_)return Result::stale;
 if(!(scopes_&static_cast<uint8_t>(c.required)))return Result::forbidden;
 for(const auto& seen:seen_)if(!seen.id.empty()&&seen.id==c.id)return seen.seq==c.seq&&seen.turn==c.turn?Result::duplicate:Result::stale;
 if(Expired(now,c.deadline)||uint32_t(c.deadline-now)>15000)return Result::expired;
 if(c.seq<=seq_||c.turn<turn_)return Result::stale;
 seq_=c.seq;turn_=c.turn;seen_[cursor_++%seen_.size()]={c.id,c.seq,c.turn};return Result::ok;
}
}
