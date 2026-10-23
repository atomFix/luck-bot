#pragma once
#include "eyes_model.h"
namespace round_eyes {
struct Triangle { Point a,b,c; };
struct Mesh { std::array<Triangle,kContourPoints-2> triangles{}; size_t count=0; };
Mesh Triangulate(const Contour& contour);
}
