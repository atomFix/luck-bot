#pragma once
#include "eyes_model.h"
#include "rasterize.h"
#include "dirty_region.h"
#include <lvgl.h>
namespace round_eyes {
class EyesView {
public:
 explicit EyesView(lv_obj_t* parent);
 ~EyesView();
 void Update(uint64_t now);
 void SetEmotion(const char* emotion,uint64_t now){model_.SetEmotion(emotion?emotion:"neutral",now);}
 lv_obj_t* object()const{return object_;}
private:
 lv_obj_t* object_;
 EyesModel model_{42};
 uint16_t* pixels_ = nullptr;
 DirtyRegion dirty_;
 uint32_t frames_=0,max_us_=0;uint64_t total_us_=0,report_at_=0;
 uint32_t refreshes_=0,refresh_max_us_=0;int64_t refresh_start_=0;
 static void Refresh(lv_event_t* event);
};
}
