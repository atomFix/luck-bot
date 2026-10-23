#pragma once
#include <string>
#include <array>
#include <cstdint>
namespace companion {
struct Controller {std::string id,token;uint8_t scopes=0;};
class Identity {
 public:
 bool Load();bool Add(Controller& out);bool Revoke(const std::string& id);
 const Controller* Find(const std::string& id) const;
 const std::string& device()const{return device_;}const std::string& boot()const{return boot_;}
 const std::string& cert()const{return cert_;}const std::string& key()const{return key_;}const std::string& fingerprint()const{return fingerprint_;}
 private:
 bool SaveControllers();
 std::string device_,boot_,cert_,key_,fingerprint_;std::array<Controller,4> controllers_{};
};
std::string RandomHex(size_t bytes);
bool ConstantEqual(const std::string& a,const std::string& b);
}
