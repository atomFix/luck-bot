#pragma once
#include "dirty_region.h"
namespace round_eyes {
constexpr int kRasterSize=240;
constexpr int kRasterTop=kEyeViewportTop;
constexpr int kRasterHeight=kEyeViewportHeight;
constexpr int kRasterPixels=kRasterSize*kRasterHeight;
// Global240px model coordinates, stored in a cropped240x160 RGB565 eye band.
void Rasterize(const Frame& frame,Rect dirty,uint16_t* pixels);
}
