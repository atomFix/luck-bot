#include "eye_poses.h"
namespace round_eyes {
// Original parametric silhouettes, in 240px display coordinates. Angles in radians.
static EyeParams E(float x,float y,float w,float h,float a=0,float b=0,float p=3) {return {x,y,w,h,a,b,p};}
// Exaggerated silhouettes stay within the existing cropped eye canvas, including motion.
static const std::array<Pose,25> poses = {{
 {E(84,120,36,54),E(156,120,36,54)},                         // 0: everyday focus
 {E(82,114,44,60,.12),E(158,114,44,60,-.12)},                // 1: bright confidence
 {E(80,120,54,12,0,-23),E(160,120,54,12,0,-23)},             // 2: unmistakable happy arches
 {E(82,119,56,62,0,0,2),E(158,119,56,62,0,0,2)},            // 3: open curiosity
 {E(84,128,48,16,.08),E(156,128,48,16,-.08)},                // 4: heavy lids
 {E(81,115,44,62,-.18),E(159,128,52,7,0,-12)},              // 5: deliberately lopsided mischief
 {E(84,126,46,24,0,-5),E(156,126,46,24,0,-5)},              // 6: relaxed half lids
 {E(81,123,54,22,.52,2),E(159,123,54,22,-.52,2)},            // 7: sharp inward angry slant
 {E(91,108,25,30,-.08),E(163,112,44,61,-.08)},              // 8: thinking, one eye raised
 {E(81,114,50,64,-.16),E(159,132,37,23,.28)},               // 9: confused, opposite asymmetry
 {E(84,118,23,76),E(156,118,23,76)},                       // 10: upright attentive eyes
 {E(80,123,62,17,0,-29),E(160,123,62,17,0,-29)},            // 11: deep laughing crescents
 {E(84,132,30,50,-.35,6,2),E(156,132,30,50,.35,6,2)},      // 12: drooping crying eyes, distinct from sad
 {E(84,132,50,5,0,3),E(156,132,50,5,0,3)},                 // 13: nearly asleep
 {E(81,128,45,20,-.3),E(159,110,30,60,.18)},                // 14: puzzled double take
 {E(82,123,52,18,.04,-2),E(158,123,52,18,-.04,-2)},         // 15: cool narrow gaze
 {E(84,133,43,26,-.38,6),E(156,133,43,26,.38,6)},          // 16: sad downward corners
 {E(83,118,48,10,0,-17),E(157,118,48,10,0,-17)},           // 17: contented squint
 {E(82,119,51,28,.14),E(158,115,44,42,-.2)},               // 18: cheeky confident eyebrow
 {E(83,123,47,38,-.16,-16),E(157,123,47,38,.16,-16)},      // 19: warm attentive curves
 {E(80,124,56,14,-.1,-24),E(160,124,56,14,.1,-24)},        // 20: smiling squeeze
 {E(82,119,60,76,0,0,2),E(158,119,60,76,0,0,2)},          // 21: wide shocked stare
 {E(84,133,48,10,.12,3),E(156,133,48,10,-.12,3)},          // 22: sleepy droop
 {E(81,128,55,7,0,-15),E(159,116,42,66,-.1)},              // 23: full wink against wide open eye
 {E(91,137,28,28,-.27,-4),E(149,137,28,28,.27,-4)}         // 24: shy inward/downward glance
}};
const Pose& GetPose(uint8_t id) {return poses[id<25?id:0];}
const std::array<Playlist,21> kEmotions = {{
 {"neutral",{0,6,0},2,5200},{"happy",{2,17,20},3,2400},{"laughing",{11,2,0},2,2000},
 {"funny",{11,5,0},2,2200},{"sad",{16,6,0},2,3200},{"angry",{7,0,0},1,2600},
 {"crying",{12,16,0},2,3200},{"loving",{19,20,0},2,3200},{"embarrassed",{24,0,0},1,2600},
 {"surprised",{3,21,0},2,2600},{"shocked",{21,0,0},1,2600},{"thinking",{8,14,0},2,3000},
 {"winking",{23,5,0},2,2400},{"cool",{15,0,0},1,3200},{"relaxed",{6,19,0},2,3400},
 {"delicious",{17,0,0},1,2800},{"kissy",{23,24,0},2,2600},{"confident",{18,1,0},2,3000},
 {"sleepy",{22,13,4},3,3800},{"silly",{5,9,0},2,2400},{"confused",{9,14,0},2,2800}
}};
}
