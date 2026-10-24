#include "server.h"
#include "identity.h"
#include "pairing.h"
#include "session.h"
#include "audio.h"
#include "layers.h"
#include "protocol.h"
#include "application.h"
#include "animation_signals.h"
#include "board.h"
#include "display.h"
#include "wifi_station.h"
#include <esp_https_server.h>
#include <esp_timer.h>
#include <esp_log.h>
#include <esp_heap_caps.h>
#include <nvs.h>
#include <cJSON.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <unistd.h>
#include <mutex>
#include <atomic>
#include <memory>
#include <array>
#include <cstring>
#include <functional>
#if __has_include("mdns.h")
#include "mdns.h"
#define RE_HAS_MDNS 1
#endif
namespace companion {
namespace {
Identity identity;Pairing pairing;std::unique_ptr<Session> session;httpd_handle_t server=nullptr;
std::recursive_mutex mu;std::atomic<bool> enabled{false},critical{false};int socket_fd=-1;
uint32_t connected_at=0,rate_at=0,rate_count=0;Capture capture;uint32_t capture_samples=0;Receiver receiver;uint32_t playback_notified=0;uint32_t audio_rate_at=0,audio_rate_count=0;
std::atomic<int> pending{0};bool ready=false;std::atomic<bool> background_active{false};Capture ambient_capture;uint32_t ambient_generation=0,pose_mode=0;
Layers layers;std::string shown;
struct Ack{std::string id;uint32_t at=0;};std::array<Ack,32> acks{};size_t ack_cursor=0;
uint32_t Now(){return static_cast<uint32_t>(esp_timer_get_time()/1000);}
std::string String(cJSON* o,const char* key){auto x=cJSON_GetObjectItemCaseSensitive(o,key);return cJSON_IsString(x)?x->valuestring:"";}
bool Number(cJSON* o,const char* key,uint32_t& out){auto x=cJSON_GetObjectItemCaseSensitive(o,key);if(!cJSON_IsNumber(x)||x->valuedouble<0||x->valuedouble>4294967295.0||x->valuedouble!=static_cast<double>(static_cast<uint32_t>(x->valuedouble)))return false;out=static_cast<uint32_t>(x->valuedouble);return true;}
std::string Json(cJSON* o){char* raw=cJSON_PrintUnformatted(o);std::string s=raw?raw:"{}";cJSON_free(raw);cJSON_Delete(o);return s;}
struct Out {int fd;std::string session_id;std::string data;bool binary;std::function<void()> after;};
bool Send(std::string data,bool binary=false,std::function<void()> after={}){
 if(!server||socket_fd<0||pending.load()>=(binary?10:20))return false;
 auto* out=new(std::nothrow) Out{socket_fd,session?session->id():"",std::move(data),binary,std::move(after)};if(!out)return false;pending++;
 auto err=httpd_queue_work(server,[](void* arg){std::unique_ptr<Out> out(static_cast<Out*>(arg));
  std::lock_guard<std::recursive_mutex> lock(mu);
  if(socket_fd==out->fd&&session&&session->id()==out->session_id){httpd_ws_frame_t frame{};frame.type=out->binary?HTTPD_WS_TYPE_BINARY:HTTPD_WS_TYPE_TEXT;frame.payload=reinterpret_cast<uint8_t*>(out->data.data());frame.len=out->data.size();
   if(httpd_ws_send_frame_async(server,out->fd,&frame)!=ESP_OK)httpd_sess_trigger_close(server,out->fd);else if(out->after)out->after();
  }pending--;
 },out);
 if(err!=ESP_OK){pending--;delete out;return false;}return true;
}
void Error(const char* code,const std::string& command=""){auto o=cJSON_CreateObject();cJSON_AddStringToObject(o,"type","error");cJSON_AddStringToObject(o,"code",code);cJSON_AddStringToObject(o,"command_id",command.c_str());Send(Json(o));}
void AckCommand(const std::string& id,uint32_t at,std::function<void()> after={}){auto o=cJSON_CreateObject();cJSON_AddStringToObject(o,"type","ack");cJSON_AddStringToObject(o,"command_id",id.c_str());cJSON_AddNumberToObject(o,"applied_uptime_ms",at);Send(Json(o),false,std::move(after));}
void StopCapture(){capture.Cancel();if(!background_active)Application::GetInstance().GetAudioService().EnableCompanionCapture(false);}
void StopBackground(const char* reason){if(!background_active.exchange(false))return;ambient_capture.Cancel();if(!capture.active())Application::GetInstance().GetAudioService().EnableCompanionCapture(false);auto o=cJSON_CreateObject();cJSON_AddStringToObject(o,"type","ambient.stopped");cJSON_AddStringToObject(o,"code",reason);Send(Json(o));pose_mode=1;round_eyes::AnimationSignals::Instance().SetCompanionPose(1,layers.ManualActive(Now()));}
bool StartBackground(const std::string& purpose){
 StopBackground("restart");StopCapture();ambient_generation=(ambient_generation+1)&0x7fffffffu;if(!ambient_generation)ambient_generation=1;const auto stream=ambient_generation|0x80000000u;ambient_capture.BeginAmbient(stream);background_active=true;pose_mode=1;
 auto o=cJSON_CreateObject();cJSON_AddStringToObject(o,"type","ambient.start");cJSON_AddNumberToObject(o,"stream_id",stream);cJSON_AddStringToObject(o,"purpose",purpose.c_str());Send(Json(o));
 auto& app=Application::GetInstance();app.SetDeviceState(kDeviceStateIdle);round_eyes::AnimationSignals::Instance().SetCompanionPose(1,layers.ManualActive(Now()));if(!app.GetAudioService().EnableCompanionCapture(true,true)){StopBackground("background_incompatible");return false;}return true;
}
void CancelAudio(){StopCapture();Application::GetInstance().GetAudioService().CancelCompanionPlayback();receiver.Reset();layers.Clear();shown.clear();auto sid=session?session->id():"";auto turn=session?session->turn():0;Application::GetInstance().Schedule([sid,turn](){std::lock_guard<std::recursive_mutex> guard(mu);if(enabled&&!critical&&(!session->Active(Now())||(session->id()==sid&&session->turn()==turn))){Application::GetInstance().SetDeviceState(kDeviceStateIdle);shown.clear();}});}
void Drop(){StopBackground("disconnected");CancelAudio();if(session)session->Release();int fd=socket_fd;socket_fd=-1;if(server&&fd>=0)httpd_sess_trigger_close(server,fd);}
std::string Info(bool private_info=false){auto o=cJSON_CreateObject();cJSON_AddNumberToObject(o,"v",1);cJSON_AddStringToObject(o,"type",private_info?"status":"info");cJSON_AddStringToObject(o,"device_id",identity.device().c_str());cJSON_AddStringToObject(o,"boot_id",identity.boot().c_str());cJSON_AddNumberToObject(o,"uptime_ms",Now());cJSON_AddStringToObject(o,"mode",enabled?"companion":"xiaozhi");
 auto caps=cJSON_AddArrayToObject(o,"capabilities");if(Application::GetInstance().GetAudioService().CanCompanionBackgroundCapture())cJSON_AddItemToArray(caps,cJSON_CreateString("ambient_v1"));
 if(private_info){cJSON_AddBoolToObject(o,"background_active",background_active);cJSON_AddBoolToObject(o,"critical",critical);cJSON_AddBoolToObject(o,"capture_active",capture.active());cJSON_AddNumberToObject(o,"capture_samples",capture_samples);cJSON_AddBoolToObject(o,"input_vad",Application::GetInstance().GetAudioService().IsVoiceDetected());cJSON_AddStringToObject(o,"session_id",session->id().c_str());cJSON_AddStringToObject(o,"lease","ours");cJSON_AddNumberToObject(o,"turn_seq",session->turn());}return Json(o);}
void UpdateLayers(){if(critical||!enabled)return;auto now=Now();if(pose_mode)round_eyes::AnimationSignals::Instance().SetCompanionPose(pose_mode,layers.ManualActive(now));std::string target=layers.Current(now);
 if(target!=shown){shown=target;Application::GetInstance().Schedule([target](){std::lock_guard<std::recursive_mutex> lock(mu);if(!critical&&enabled&&shown==target)Board::GetInstance().GetDisplay()->SetEmotion(target.c_str());});}
}
void SerialWrite(cJSON* o){std::string data="REYE/1 "+Json(o)+"\n";fwrite(data.data(),1,data.size(),stdout);fflush(stdout);}
void SerialLoop(void*){
 std::string line;char ch;
 while(true){if(read(STDIN_FILENO,&ch,1)!=1){vTaskDelay(pdMS_TO_TICKS(20));continue;}if(ch=='\n'||ch=='\r'){
  if(line.rfind("REYE/1 ",0)==0){cJSON* req=cJSON_Parse(line.c_str()+7);std::lock_guard<std::recursive_mutex> lock(mu);
   if(String(req,"op")=="pair"&&pairing.Begin(ready,Application::GetInstance().GetDeviceState()==kDeviceStateIdle,WifiStation::GetInstance().IsConnected(),Now())){
    auto o=cJSON_CreateObject();cJSON_AddStringToObject(o,"type","pairing.pending");cJSON_AddStringToObject(o,"device_id",identity.device().c_str());SerialWrite(o);
    Application::GetInstance().Schedule([](){Board::GetInstance().GetDisplay()->ShowNotification("USB pairing: press BOOT",30000);});
   }
   cJSON_Delete(req);
  }line.clear();
 }else if(line.size()<2048){line+=ch;}else{line.clear();}
 }
}
const char* ResultCode(Result r){switch(r){case Result::unauthorized:return "unauthorized";case Result::forbidden:return "forbidden";case Result::busy:return "busy";case Result::expired:return "expired";case Result::rate:return "rate";default:return "stale";}}
esp_err_t InfoHandler(httpd_req_t* req){auto json=Info();httpd_resp_set_type(req,"application/json");return httpd_resp_send(req,json.c_str(),json.size());}
esp_err_t Ws(httpd_req_t* req){
 std::lock_guard<std::recursive_mutex> lock(mu);const int fd=httpd_req_to_sockfd(req);
 if(req->method==HTTP_GET){if(socket_fd>=0&&socket_fd!=fd)return ESP_FAIL;socket_fd=fd;connected_at=Now();return ESP_OK;}
 if(fd!=socket_fd)return ESP_FAIL;
 httpd_ws_frame_t frame{};esp_err_t e=httpd_ws_recv_frame(req,&frame,0);if(e!=ESP_OK)return e;
 if(frame.len>2048)return ESP_FAIL;
 std::array<uint8_t,2049> data{};frame.payload=data.data();if(httpd_ws_recv_frame(req,&frame,frame.len)!=ESP_OK)return ESP_FAIL;
 if(frame.type==HTTPD_WS_TYPE_CLOSE){Drop();return ESP_OK;}
 if(frame.type==HTTPD_WS_TYPE_PING){frame.type=HTTPD_WS_TYPE_PONG;return httpd_ws_send_frame(req,&frame);}
 if(frame.type==HTTPD_WS_TYPE_BINARY){
  if(!session->Active(Now())||!(session->scopes()&4)||!enabled){Error("forbidden");return ESP_OK;}
  auto now=Now();if(now-audio_rate_at>=1000){audio_rate_at=now;audio_rate_count=0;}if(++audio_rate_count>60){CancelAudio();Error("rate");return ESP_OK;}
  AudioHeader h{};if(!DecodeAudio(data.data(),frame.len,h)||!receiver.Accept(h,session->turn())){Error("format");return ESP_OK;}
  if(!Application::GetInstance().GetAudioService().PushCompanionPcm(data.data()+24,h.payload_len,h.turn_seq,h.end)){CancelAudio();Error("overflow");}return ESP_OK;
 }
 if(frame.type!=HTTPD_WS_TYPE_TEXT)return ESP_FAIL;
 cJSON* raw=cJSON_ParseWithLength(reinterpret_cast<char*>(data.data()),frame.len);if(!raw)return ESP_FAIL;
 std::unique_ptr<cJSON,decltype(&cJSON_Delete)> root(raw,cJSON_Delete);auto type=String(raw,"type");
 if(type=="auth"){
  if(session->Active(Now())){Error("busy");return ESP_OK;}
  auto controller=identity.Find(String(raw,"controller_id"));if(!controller||!ConstantEqual(controller->token,String(raw,"token"))){Error("unauthorized");return ESP_FAIL;}
  auto result=session->Authenticate(controller->id,controller->scopes,Now());if(result!=Result::ok){Error(ResultCode(result));return ESP_OK;}acks={};Send(Info(true));return ESP_OK;
 }
 if(!session->Active(Now())){Error("unauthorized");return ESP_FAIL;}
 auto command=String(raw,"command_id");uint32_t seq,turn,deadline,version;
 if(!Number(raw,"v",version)||version!=1||String(raw,"device_id")!=identity.device()||command.empty()||command.size()>64||!Number(raw,"seq",seq)||!Number(raw,"turn_seq",turn)||!Number(raw,"deadline_ms",deadline)){Error("format",command);return ESP_OK;}
 auto payload=cJSON_GetObjectItem(raw,"payload");uint32_t hold=0;std::string emotion,source;
 bool listen_enabled=false,listening_pose=false;std::string purpose;Scope required=Scope::status;
 if(type=="reaction"){required=Scope::reaction;emotion=String(payload,"emotion");source=String(payload,"source");if(!Number(payload,"hold_ms",hold)||!ValidReaction(emotion.c_str(),hold)||(source!="manual"&&source!="voice"&&source!="agent")){Error("format",command);return ESP_OK;}}
 else if(type=="listen"){required=Scope::owner;auto value=cJSON_GetObjectItemCaseSensitive(payload,"enabled");purpose=String(payload,"purpose");if(!cJSON_IsBool(value)||(cJSON_IsTrue(value)&&purpose!="ambient"&&purpose!="enroll")){Error("format",command);return ESP_OK;}listen_enabled=cJSON_IsTrue(value);}
 else if(type=="listen_pose"){required=Scope::owner;auto value=cJSON_GetObjectItemCaseSensitive(payload,"listening");if(!cJSON_IsBool(value)){Error("format",command);return ESP_OK;}listening_pose=cJSON_IsTrue(value);}
 else if(type=="mode"||type=="revoke")required=Scope::owner;
 else if(type=="cancel")required=Scope::reaction;
 else if(type!="heartbeat"&&type!="status"&&type!="release"){Error("unsupported",command);return ESP_OK;}
 auto now=Now();if(now-rate_at>=1000){rate_at=now;rate_count=0;}if(++rate_count>40){Error("rate",command);return ESP_OK;}
 Command cmd{String(raw,"boot_id"),String(raw,"session_id"),command,seq,turn,deadline,required};
 auto old_turn=session->turn();auto result=session->Accept(cmd,now);if(result==Result::ok&&turn>old_turn)layers.ClearOlder(turn);if(result==Result::duplicate){for(auto& ack:acks)if(ack.id==command){AckCommand(command,ack.at);return ESP_OK;}Error("busy",command);return ESP_OK;}
 if(result!=Result::ok){Error(ResultCode(result),command);return ESP_OK;}
 if(type=="heartbeat")session->Heartbeat(now);
 if(type=="status"){auto text=Info(true);cJSON* o=cJSON_Parse(text.c_str());cJSON_AddStringToObject(o,"command_id",command.c_str());Send(Json(o));return ESP_OK;}
 if(type=="cancel")CancelAudio();
 if(type=="revoke"){auto id=String(payload,"controller_id");if(!identity.Revoke(id)){Error("format",command);return ESP_OK;}}
 if(type=="mode"){
  auto mode=String(payload,"mode");if(mode!="companion"&&mode!="xiaozhi"){Error("format",command);return ESP_OK;}StopBackground("mode");CancelAudio();enabled=mode=="companion";pose_mode=0;round_eyes::AnimationSignals::Instance().SetCompanionPose(0,false);
  nvs_handle_t h;if(nvs_open("re_companion",NVS_READWRITE,&h)==ESP_OK){nvs_set_u8(h,"mode",enabled?1:0);nvs_commit(h);nvs_close(h);}
  Application::GetInstance().Schedule([](){auto& app=Application::GetInstance();app.EnterCompanionMode();});
 }
 auto sid=session->id();auto revoke_id=String(payload,"controller_id");Application::GetInstance().Schedule([type,command,emotion,source,hold,turn,sid,revoke_id,listen_enabled,listening_pose,purpose](){
  std::lock_guard<std::recursive_mutex> guard(mu);if(!session||!session->Active(Now())||session->id()!=sid||session->turn()!=turn)return;
  if(type=="listen"){
   if(listen_enabled){if(!enabled||critical||!Application::GetInstance().GetAudioService().CanCompanionBackgroundCapture()){Error("background_unavailable",command);return;}if(!StartBackground(purpose)){Error("background_incompatible",command);return;}}else StopBackground("disabled");
  }
  if(type=="listen_pose"){pose_mode=listening_pose?2:1;if(listening_pose)layers.ClearOlder(turn+1);round_eyes::AnimationSignals::Instance().SetCompanionPose(pose_mode,layers.ManualActive(Now()));UpdateLayers();}
  if(type=="reaction"){
   if(!enabled||critical){Error("busy",command);return;}Application::GetInstance().SetDeviceState(kDeviceStateIdle);size_t rank=source=="manual"?0:source=="voice"?1:2;if(!layers.Put(rank,emotion,hold,turn,Now())){Error("busy",command);return;}
   // Set the target on the application/UI boundary before acknowledging applied.
   UpdateLayers();Board::GetInstance().GetDisplay()->SetEmotion(shown.c_str());
  }
  auto at=Now();acks[ack_cursor++%acks.size()]={command,at};if(type=="release"||(type=="revoke"&&revoke_id==session->controller())){AckCommand(command,at,[](){StopBackground("released");CancelAudio();session->Release();});}else AckCommand(command,at);
 });return ESP_OK;
}
}
bool Enabled(){return enabled.load();}
bool BackgroundActive(){return enabled.load()&&background_active.load();}
void Critical(bool active){std::lock_guard<std::recursive_mutex> lock(mu);critical=active;if(active)StopBackground("critical");layers.SetCritical(active);if(!active)shown.clear();}
bool ConfirmPairing(){std::lock_guard<std::recursive_mutex> lock(mu);bool waiting=pairing.Pending(Now());if(!waiting)return false;
 if(!WifiStation::GetInstance().IsConnected()||!ready){pairing.Cancel();return true;}
 if(!pairing.ConfirmBootClick(Now()))return true;
 Controller c;auto o=cJSON_CreateObject();if(identity.Add(c)){
  cJSON_AddStringToObject(o,"type","pairing.complete");cJSON_AddStringToObject(o,"device_id",identity.device().c_str());cJSON_AddStringToObject(o,"fingerprint",identity.fingerprint().c_str());cJSON_AddStringToObject(o,"certificate",identity.cert().c_str());cJSON_AddStringToObject(o,"host",WifiStation::GetInstance().GetIpAddress().c_str());cJSON_AddStringToObject(o,"controller_id",c.id.c_str());cJSON_AddStringToObject(o,"token",c.token.c_str());
 }else{cJSON_AddStringToObject(o,"type","error");cJSON_AddStringToObject(o,"code","storage_full");}SerialWrite(o);
 Application::GetInstance().Schedule([](){Board::GetInstance().GetDisplay()->ShowNotification("USB pairing complete",3000);});return true;
}
void OnWake(){std::lock_guard<std::recursive_mutex> lock(mu);if(!enabled||!session||!session->Active(Now()))return;StopBackground("wake");CancelAudio();pose_mode=1;round_eyes::AnimationSignals::Instance().SetCompanionPose(1,false);uint32_t turn=session->BeginVoiceTurn(Now());capture.Begin(turn,true);capture_samples=0;
 auto o=cJSON_CreateObject();cJSON_AddStringToObject(o,"type","utterance.start");cJSON_AddNumberToObject(o,"turn_seq",turn);Send(Json(o));
 auto sid=session->id();
 // CancelAudio queued Idle first. Start AFE on the main loop after that cleanup,
 // otherwise Idle immediately stops the new processor before it can emit PCM.
 Application::GetInstance().Schedule([turn,sid](){
  std::lock_guard<std::recursive_mutex> guard(mu);
  if(!enabled||!session->Active(Now())||session->id()!=sid||session->turn()!=turn||!capture.active())return;
  Application::GetInstance().SetDeviceState(kDeviceStateListening);
  Application::GetInstance().GetAudioService().EnableCompanionCapture(true);
 });
}
bool HandleToggle(){if(!enabled)return false;std::lock_guard<std::recursive_mutex> lock(mu);if(capture.active()){StopCapture();Error("cancelled");}else OnWake();return true;}
void OnPcm(const int16_t* data,size_t size,bool speaking){std::lock_guard<std::recursive_mutex> lock(mu);PcmFrame frame;if(background_active&&ambient_capture.active()){
 if(!session->Active(Now())||critical||!enabled){StopBackground("expired");return;}if(!ambient_capture.Feed(data,size,frame,speaking))return;if(!Send(std::string(reinterpret_cast<char*>(frame.data.data()),frame.size),true)){StopBackground("overflow");Error("overflow");}return;}
 if(!capture.Feed(data,size,frame,speaking)){return;}
 capture_samples+=size;
 if(capture_samples>=1440000){StopCapture();Error("utterance_too_long");return;}
 if(!Send(std::string(reinterpret_cast<char*>(frame.data.data()),frame.size),true)){StopCapture();Error("overflow");return;}
 if(!capture.active()){Application::GetInstance().GetAudioService().EnableCompanionCapture(false);auto o=cJSON_CreateObject();cJSON_AddStringToObject(o,"type","utterance.end");cJSON_AddNumberToObject(o,"turn_seq",capture.turn());Send(Json(o));Application::GetInstance().Schedule([](){round_eyes::AnimationSignals::Instance().NotifyRecognizedText(true,Now());});}
}
bool OnPlayback(uint32_t turn){std::lock_guard<std::recursive_mutex> lock(mu);if(!enabled||!session||!session->Active(Now())||session->turn()!=turn)return false;if(playback_notified==turn)return true;playback_notified=turn;round_eyes::AnimationSignals::Instance().PublishDeviceState(round_eyes::InputState::Speaking,Now());auto sid=session->id();Application::GetInstance().Schedule([turn,sid](){std::lock_guard<std::recursive_mutex> lock(mu);if(session->Active(Now())&&session->id()==sid&&session->turn()==turn)Application::GetInstance().SetDeviceState(kDeviceStateSpeaking);});auto o=cJSON_CreateObject();cJSON_AddStringToObject(o,"type","playback.started");cJSON_AddNumberToObject(o,"turn_seq",turn);Send(Json(o));return true;}
void OnPlaybackEnd(uint32_t turn){std::lock_guard<std::recursive_mutex> lock(mu);auto sid=session->id();Application::GetInstance().Schedule([turn,sid](){std::lock_guard<std::recursive_mutex> guard(mu);if(session->Active(Now())&&session->id()==sid&&session->turn()==turn){Application::GetInstance().SetDeviceState(kDeviceStateIdle);shown.clear();UpdateLayers();}});}
void Tick(){std::lock_guard<std::recursive_mutex> lock(mu);pairing.Pending(Now());if(socket_fd>=0&&httpd_ws_get_fd_info(server,socket_fd)!=HTTPD_WS_CLIENT_WEBSOCKET){Drop();return;}if(socket_fd>=0&&(!session->Active(Now())&&Now()-connected_at>3000))Drop();UpdateLayers();}
void InitializeMode(){enabled=true;nvs_handle_t h;if(nvs_open("re_companion",NVS_READONLY,&h)==ESP_OK){uint8_t mode=1;nvs_get_u8(h,"mode",&mode);enabled=mode==1;nvs_close(h);}}
bool Start(){
 std::lock_guard<std::recursive_mutex> lock(mu);if(server)return true;InitializeMode();if(!identity.Load()){ESP_LOGE("Companion","Identity unavailable; legacy configuration preserved");return false;}
 session=std::make_unique<Session>(identity.boot());
 httpd_ssl_config_t cfg=HTTPD_SSL_CONFIG_DEFAULT();cfg.httpd.stack_size=10240;cfg.httpd.max_open_sockets=2;cfg.httpd.lru_purge_enable=false;cfg.httpd.recv_wait_timeout=2;cfg.httpd.send_wait_timeout=2;cfg.port_secure=8443;
 cfg.servercert=reinterpret_cast<const uint8_t*>(identity.cert().c_str());cfg.servercert_len=identity.cert().size()+1;cfg.prvtkey_pem=reinterpret_cast<const uint8_t*>(identity.key().c_str());cfg.prvtkey_len=identity.key().size()+1;
 if(httpd_ssl_start(&server,&cfg)!=ESP_OK){server=nullptr;ESP_LOGE("Companion","HTTPS unavailable; selected mode preserved");return false;}
 httpd_uri_t info{};info.uri="/v1/info";info.method=HTTP_GET;info.handler=InfoHandler;httpd_register_uri_handler(server,&info);
 httpd_uri_t ws{};ws.uri="/v1/session";ws.method=HTTP_GET;ws.handler=Ws;ws.is_websocket=true;httpd_register_uri_handler(server,&ws);
 #ifdef RE_HAS_MDNS
 if(mdns_init()==ESP_OK){mdns_hostname_set(identity.device().c_str());mdns_service_add("Round Eyes","_roundeyes","_tcp",8443,nullptr,0);mdns_service_txt_item_set("_roundeyes","_tcp","device_id",identity.device().c_str());}
 #endif
 ready=true;xTaskCreate(SerialLoop,"re_usb",4096,nullptr,2,nullptr);xTaskCreate([](void*){while(true){Tick();vTaskDelay(pdMS_TO_TICKS(40));}},"re_tick",4096,nullptr,2,nullptr);
 ESP_LOGI("Companion","HTTPS ready on 8443; free internal heap=%lu",static_cast<unsigned long>(heap_caps_get_free_size(MALLOC_CAP_INTERNAL)));return true;
}
}
