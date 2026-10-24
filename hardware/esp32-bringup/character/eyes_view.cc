#include "eyes_view.h"
#include "animation_signals.h"
#include <esp_timer.h>
#include <esp_log.h>
#include <esp_system.h>
#include <esp_heap_caps.h>
#include <esp_err.h>
#include <algorithm>
namespace round_eyes {
EyesView::EyesView(lv_obj_t* parent){
 pixels_=static_cast<uint16_t*>(heap_caps_calloc(kRasterPixels,sizeof(uint16_t),MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT));
 ESP_ERROR_CHECK(pixels_?ESP_OK:ESP_ERR_NO_MEM);
 ESP_LOGI("RoundEyes","renderer=contour-rgb565 canvas_bytes=115200 timer_period_ms=30 refresh_timer_ms=10 target_fps=25");
 object_=lv_canvas_create(parent);lv_obj_remove_style_all(object_);lv_canvas_set_buffer(object_,pixels_,240,kRasterHeight,LV_COLOR_FORMAT_RGB565);lv_obj_center(object_);
 lv_obj_set_style_bg_color(object_,lv_color_black(),0);lv_obj_set_style_bg_opa(object_,LV_OPA_COVER,0);
 lv_obj_remove_flag(object_,LV_OBJ_FLAG_SCROLLABLE);
 // Default33ms refresh scheduling coalesces updates with this100Hz port.
 // A short refresh deadline consumes each completed canvas promptly; the
 // refresh timer pauses when no pixels are invalid, so this is not100FPS.
 lv_timer_set_period(lv_display_get_refr_timer(lv_obj_get_display(object_)),10);
 lv_display_add_event_cb(lv_obj_get_display(object_),Refresh,LV_EVENT_REFR_START,this);
 lv_display_add_event_cb(lv_obj_get_display(object_),Refresh,LV_EVENT_REFR_READY,this);
}
EyesView::~EyesView(){auto display=lv_obj_get_display(object_);lv_display_remove_event_cb_with_user_data(display,Refresh,this);lv_timer_set_period(lv_display_get_refr_timer(display),LV_DEF_REFR_PERIOD);lv_obj_delete(object_);heap_caps_free(pixels_);}
void EyesView::Refresh(lv_event_t* event){
 auto self=static_cast<EyesView*>(lv_event_get_user_data(event));auto now=esp_timer_get_time();
 if(lv_event_get_code(event)==LV_EVENT_REFR_START)self->refresh_start_=now;
 else{++self->refreshes_;self->refresh_max_us_=std::max(self->refresh_max_us_,static_cast<uint32_t>(now-self->refresh_start_));}
}
void EyesView::Update(uint64_t now){
 auto start=esp_timer_get_time();auto signal=AnimationSignals::Instance().Read(now);
 model_.SetMotion(signal.critical?MotionCue{}:AnimationSignals::Instance().timeline.Read(now));
 model_.SetBehavior(signal.behavior,now);model_.ObserveAudio(signal.energy,signal.audio_at_ms);auto frame=model_.Tick(now);
 auto r=dirty_.Update(frame);Rasterize(frame,r,pixels_);
 lv_area_t bounds;lv_obj_get_coords(object_,&bounds);
 lv_area_t area{bounds.x1+r.x1,bounds.y1+r.y1-kRasterTop,bounds.x1+r.x2,bounds.y1+r.y2-kRasterTop};lv_obj_invalidate_area(object_,&area);
 uint32_t us=esp_timer_get_time()-start;total_us_+=us;max_us_=std::max(max_us_,us);++frames_;
 if(!report_at_)report_at_=now;
 // ROM newlib-nano does not support %llu: using it misaligns the remaining varargs.
 if(now-report_at_>=10000){ESP_LOGI("RoundEyes","frames=%lu update_fps=%.1f refresh_fps=%.1f refresh_max_us=%lu update_avg_us=%lu update_max_us=%lu behavior=%s heap=%lu min_heap=%lu",(unsigned long)frames_,frames_*1000.0/(now-report_at_),refreshes_*1000.0/(now-report_at_),(unsigned long)refresh_max_us_,(unsigned long)(total_us_/frames_),(unsigned long)max_us_,BehaviorName(frame.behavior),(unsigned long)esp_get_free_heap_size(),(unsigned long)esp_get_minimum_free_heap_size());frames_=0;refreshes_=0;refresh_max_us_=0;total_us_=0;max_us_=0;report_at_=now;}
}
}
