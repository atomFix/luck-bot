#pragma once
#include <array>
#include <string>
#include <cstdint>
namespace companion {
enum class Result {ok,duplicate,unauthorized,forbidden,busy,expired,stale,rate};
enum class Scope:uint8_t {status=1,reaction=2,voice=4,owner=8};
struct Command {std::string boot,session,id;uint32_t seq,turn,deadline;Scope required;};
class Session {
 public:
 explicit Session(std::string boot):boot_(std::move(boot)){}
 Result Authenticate(const std::string& controller,uint8_t scopes,uint32_t now);
 Result Accept(const Command& c,uint32_t now);
 uint32_t BeginVoiceTurn(uint32_t now){if(!Active(now))return 0;return ++turn_;}
 bool Heartbeat(uint32_t now);
 bool Active(uint32_t now);
 void Release();void Revoke(const std::string& controller);
 const std::string& id()const{return session_;}const std::string& controller()const{return controller_;}
 uint32_t turn()const{return turn_;}uint8_t scopes()const{return scopes_;}
 private:
 struct Seen {std::string id;uint32_t seq=0,turn=0;};
 std::string boot_,session_,controller_;uint8_t scopes_=0;uint32_t until_=0,seq_=0,turn_=0,generation_=0;
 std::array<Seen,32> seen_{};size_t cursor_=0;
};
}
