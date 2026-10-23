#include "identity.h"
#include <esp_random.h>
#include <esp_mac.h>
#include <nvs.h>
#include <mbedtls/pk.h>
#include <mbedtls/x509_crt.h>
#include <mbedtls/sha256.h>
#include <cJSON.h>
#include <cstring>
namespace companion {
static int Rng(void*,unsigned char* out,size_t size){esp_fill_random(out,size);return 0;}
static std::string Hex(const uint8_t* b,size_t n){static const char* h="0123456789abcdef";std::string s;s.reserve(n*2);for(size_t i=0;i<n;i++){s+=h[b[i]>>4];s+=h[b[i]&15];}return s;}
std::string RandomHex(size_t n){std::string s(n,'\0');esp_fill_random(s.data(),n);return Hex(reinterpret_cast<const uint8_t*>(s.data()),n);}
bool ConstantEqual(const std::string&a,const std::string&b){if(a.size()!=b.size())return false;volatile uint8_t diff=0;for(size_t i=0;i<a.size();i++)diff=diff|uint8_t(a[i]^b[i]);return diff==0;}
static bool Read(nvs_handle_t h,const char* name,std::string& out){size_t size=0;if(nvs_get_str(h,name,nullptr,&size)!=ESP_OK||size>4096)return false;out.resize(size);if(nvs_get_str(h,name,out.data(),&size)!=ESP_OK)return false;out.resize(size-1);return true;}
static bool MakeCert(const std::string& id,std::string& cert,std::string& key){
 mbedtls_pk_context pk;mbedtls_pk_init(&pk);mbedtls_x509write_cert crt;mbedtls_x509write_crt_init(&crt);mbedtls_mpi serial;mbedtls_mpi_init(&serial);
 unsigned char buf[2048]{};unsigned char serial_bytes[1]={1};bool ok=false;std::string name="CN="+id;
 do {
  if(mbedtls_pk_setup(&pk,mbedtls_pk_info_from_type(MBEDTLS_PK_ECKEY)))break;
  if(mbedtls_ecp_gen_key(MBEDTLS_ECP_DP_SECP256R1,mbedtls_pk_ec(pk),Rng,nullptr))break;
  if(mbedtls_pk_write_key_pem(&pk,buf,sizeof(buf)))break;
  key=reinterpret_cast<char*>(buf);
  mbedtls_x509write_crt_set_version(&crt,MBEDTLS_X509_CRT_VERSION_3);mbedtls_x509write_crt_set_md_alg(&crt,MBEDTLS_MD_SHA256);
  mbedtls_x509write_crt_set_subject_key(&crt,&pk);mbedtls_x509write_crt_set_issuer_key(&crt,&pk);
  if(mbedtls_mpi_lset(&serial,1)||mbedtls_x509write_crt_set_serial_raw(&crt,serial_bytes,1)||mbedtls_x509write_crt_set_subject_name(&crt,name.c_str())||mbedtls_x509write_crt_set_issuer_name(&crt,name.c_str())||mbedtls_x509write_crt_set_validity(&crt,"20260101000000","20460101000000")||mbedtls_x509write_crt_set_basic_constraints(&crt,1,-1)||mbedtls_x509write_crt_set_key_usage(&crt,MBEDTLS_X509_KU_DIGITAL_SIGNATURE|MBEDTLS_X509_KU_KEY_CERT_SIGN))break;
  if(mbedtls_x509write_crt_pem(&crt,buf,sizeof(buf),Rng,nullptr))break;
  cert=reinterpret_cast<char*>(buf);ok=true;
 }while(false);
 mbedtls_mpi_free(&serial);mbedtls_x509write_crt_free(&crt);mbedtls_pk_free(&pk);return ok;
}
bool Identity::Load(){
 uint8_t mac[6];esp_read_mac(mac,ESP_MAC_WIFI_STA);device_="roundeyes-"+Hex(mac,6);boot_=RandomHex(8);
 nvs_handle_t h;if(nvs_open("re_companion",NVS_READWRITE,&h)!=ESP_OK)return false;
 bool haveCert=Read(h,"cert",cert_),haveKey=Read(h,"key",key_);
 if(haveCert!=haveKey){nvs_close(h);return false;}
 if(!haveCert){if(!MakeCert(device_,cert_,key_)||nvs_set_str(h,"cert",cert_.c_str())!=ESP_OK||nvs_set_str(h,"key",key_.c_str())!=ESP_OK||nvs_commit(h)!=ESP_OK){nvs_close(h);return false;}}
 std::string records;if(Read(h,"controllers",records)){
  cJSON* a=cJSON_Parse(records.c_str());if(!cJSON_IsArray(a)||cJSON_GetArraySize(a)>4){cJSON_Delete(a);nvs_close(h);return false;}
  for(int i=0;i<cJSON_GetArraySize(a);i++){auto o=cJSON_GetArrayItem(a,i);auto id=cJSON_GetObjectItem(o,"id"),token=cJSON_GetObjectItem(o,"token"),scopes=cJSON_GetObjectItem(o,"scopes");if(!cJSON_IsString(id)||!cJSON_IsString(token)||!cJSON_IsNumber(scopes)){cJSON_Delete(a);nvs_close(h);return false;}controllers_[i]={id->valuestring,token->valuestring,static_cast<uint8_t>(scopes->valueint)};}cJSON_Delete(a);
 }
 nvs_close(h);mbedtls_x509_crt crt;mbedtls_x509_crt_init(&crt);if(mbedtls_x509_crt_parse(&crt,reinterpret_cast<const unsigned char*>(cert_.c_str()),cert_.size()+1)){mbedtls_x509_crt_free(&crt);return false;}
 uint8_t hash[32];mbedtls_sha256(crt.raw.p,crt.raw.len,hash,0);fingerprint_=Hex(hash,32);mbedtls_x509_crt_free(&crt);return true;
}
bool Identity::SaveControllers(){auto a=cJSON_CreateArray();for(auto& c:controllers_)if(!c.id.empty()){auto o=cJSON_CreateObject();cJSON_AddStringToObject(o,"id",c.id.c_str());cJSON_AddStringToObject(o,"token",c.token.c_str());cJSON_AddNumberToObject(o,"scopes",c.scopes);cJSON_AddItemToArray(a,o);}char* text=cJSON_PrintUnformatted(a);nvs_handle_t h;bool ok=false;if(nvs_open("re_companion",NVS_READWRITE,&h)==ESP_OK){ok=nvs_set_str(h,"controllers",text)==ESP_OK&&nvs_commit(h)==ESP_OK;nvs_close(h);}cJSON_free(text);cJSON_Delete(a);return ok;}
bool Identity::Add(Controller& out){for(auto& c:controllers_)if(c.id.empty()){c={RandomHex(8),RandomHex(32),15};if(!SaveControllers()){c={};return false;}out=c;return true;}return false;}
const Controller* Identity::Find(const std::string& id)const{for(auto& c:controllers_)if(c.id==id&&!id.empty())return &c;return nullptr;}
bool Identity::Revoke(const std::string& id){for(auto& c:controllers_)if(c.id==id){auto old=c;c={};if(SaveControllers())return true;c=old;return false;}return false;}
}
