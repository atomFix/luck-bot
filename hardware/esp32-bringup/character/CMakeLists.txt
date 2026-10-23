idf_component_register(SRCS "eyes_model.cc" "eye_poses.cc" "triangulate.cc" "animation_signals.cc" "rasterize.cc"
                       INCLUDE_DIRS "." REQUIRES lvgl esp_timer esp_system heap)
if(CONFIG_ROUND_EYES_CHARACTER)
 target_sources(${COMPONENT_LIB} PRIVATE "eyes_view.cc" "round_eyes_ui.cc")
endif()
