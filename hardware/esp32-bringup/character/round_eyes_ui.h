#pragma once
#include "eyes_view.h"
namespace round_eyes {
class RoundEyesUi {
public:
 RoundEyesUi(lv_obj_t* screen,lv_obj_t* legacy,lv_obj_t* status,lv_obj_t* chat,const lv_font_t* font);
 ~RoundEyesUi();
 void SetEmotion(const char* key);
 void Notify(const char* message,int duration_ms);
 void Chat(const char* role,const char* text);
private:
 EyesView view_;
 lv_obj_t *status_,*chat_,*prompt_,*caption_;
 lv_timer_t* timer_;
 uint64_t notice_until_=0;
 static void Timer(lv_timer_t* timer);
 void Update();
};
}
