#include "round_eyes_ui.h"
#include "animation_signals.h"
#include "eye_poses.h"
#include <esp_timer.h>
#include <cstring>
#include <algorithm>
#include <cstdio>
namespace round_eyes {
static uint64_t Now(){return esp_timer_get_time()/1000;}
RoundEyesUi::RoundEyesUi(lv_obj_t* screen,lv_obj_t* legacy,lv_obj_t* status,lv_obj_t* chat,const lv_font_t* font):view_(screen),status_(status),chat_(chat){
 lv_obj_add_flag(legacy,LV_OBJ_FLAG_HIDDEN);
 auto label=[&](int w,int h,int y){auto p=lv_label_create(screen);lv_obj_set_style_text_font(p,font,0);lv_obj_set_style_text_color(p,lv_color_white(),0);lv_obj_set_style_text_align(p,LV_TEXT_ALIGN_CENTER,0);lv_obj_set_size(p,w,h);lv_obj_align(p,LV_ALIGN_CENTER,0,y);lv_label_set_long_mode(p,LV_LABEL_LONG_DOT);lv_label_set_text(p,"");return p;};
 prompt_=label(174,120,0);caption_=label(160,44,65);
 // The100Hz LVGL port yields one10ms RTOS tick each loop;30ms request
 // leaves that scheduling allowance inside our40ms/25FPS device budget.
 timer_=lv_timer_create(Timer,30,this);Update();
}
RoundEyesUi::~RoundEyesUi(){lv_timer_delete(timer_);lv_obj_delete(prompt_);lv_obj_delete(caption_);}
void RoundEyesUi::SetEmotion(const char* key){view_.SetEmotion(key,Now());}
void RoundEyesUi::Notify(const char* message,int duration){if(!message||!*message)return;lv_label_set_text(prompt_,message);notice_until_=Now()+std::max(0,duration);}
void RoundEyesUi::Chat(const char* role,const char* text){
 if(role&&std::strcmp(role,"system")==0&&text&&*text)Notify(text,10000);
#ifdef CONFIG_ROUND_EYES_CAPTIONS
 if(role&&(std::strcmp(role,"user")==0||std::strcmp(role,"assistant")==0))lv_label_set_text(caption_,text?text:"");
#endif
}
void RoundEyesUi::Timer(lv_timer_t* timer){static_cast<RoundEyesUi*>(lv_timer_get_user_data(timer))->Update();}
void RoundEyesUi::Update(){
 auto now=Now();auto signal=AnimationSignals::Instance().Read(now);bool critical=signal.critical||now<notice_until_;
 const auto motion=AnimationSignals::Instance().timeline.Read(now);
 const bool continuous=!critical&&motion.active&&motion.gesture!=HeadGesture::None&&motion.emotion<kEmotions.size()&&GetPoseRadius(kEmotions[motion.emotion].ids[0])<=104;
 const uint32_t period=continuous?10:30;
 if(period!=timer_period_){lv_timer_set_period(timer_,period);timer_period_=period;}
 if(critical){lv_obj_add_flag(view_.object(),LV_OBJ_FLAG_HIDDEN);lv_obj_remove_flag(prompt_,LV_OBJ_FLAG_HIDDEN);lv_obj_add_flag(caption_,LV_OBJ_FLAG_HIDDEN);
  if(now>=notice_until_){const char* status=lv_label_get_text(status_);const char* chat=lv_label_get_text(chat_);char text[768];snprintf(text,sizeof(text),"%s\n%s",status,chat);if(std::strcmp(lv_label_get_text(prompt_),text))lv_label_set_text(prompt_,text);}
 }else{lv_obj_remove_flag(view_.object(),LV_OBJ_FLAG_HIDDEN);lv_obj_add_flag(prompt_,LV_OBJ_FLAG_HIDDEN);
#ifdef CONFIG_ROUND_EYES_CAPTIONS
 lv_obj_remove_flag(caption_,LV_OBJ_FLAG_HIDDEN);
#else
 lv_obj_add_flag(caption_,LV_OBJ_FLAG_HIDDEN);
#endif
 view_.Update(now);}
}
}
