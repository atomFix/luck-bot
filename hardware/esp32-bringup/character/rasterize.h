#pragma once
#include "dirty_region.h"
namespace round_eyes {
constexpr int kRasterSize=240;
constexpr int kRasterTop=kEyeViewportTop;
constexpr int kRasterHeight=kEyeViewportHeight;
constexpr int kRasterPixels=kRasterSize*kRasterHeight;
// Global240px model coordinates, stored in a 240x240 RGB565 canvas with dirty-area updates.
void Rasterize(const Frame& frame,Rect dirty,uint16_t* pixels);
}
