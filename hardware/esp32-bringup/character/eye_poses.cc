#include "eye_poses.h"
namespace round_eyes {
// Independent capsule silhouettes; no traced artwork or extracted polygons.
// width/height describe the rounded pill; Facing supplies whole-face orientation.
static EyeParams E(float x,float y,float w,float h,float a=0,float p=4){return {x,y,w,h,a,0,p};}
static const std::array<Pose,kPoseCount> poses = {{
 {E(85,118,20,35),E(155,118,20,35)},                  // 0 resting, small attentive eyes
 {E(85,116,21,37,-.07),E(155,116,21,37,-.07)},        // 1 bright attention
 {E(82,128,25,48,.12),E(156,128,25,48,.12)},          // 2 happy, open rounded pills
 {E(84,120,34,39,0,2),E(156,120,34,39,0,2)},          // 3 surprise
 {E(86,130,29,7,.08),E(154,132,29,7,.08)},            // 4 heavy lids
 {E(84,121,21,37,-.08),E(156,124,28,5,.1)},           // 5 teasing asymmetry
 {E(85,126,24,18,.08),E(155,126,24,18,.08)},           // 6 relaxed
 {E(85,122,22,44,-.52),E(155,122,22,44,.52)},         // 7 angry inward V
 {E(85,118,19,34,-.08),E(155,119,24,20,.08)},         // 8 thinking
 {E(84,120,22,38,-.1),E(156,124,28,6,.12)},           // 9 confused
 {E(84,119,19,49,.08),E(156,119,19,49,.08)},          // 10 listening
 {E(82,129,30,51,.16),E(156,129,30,51,.16)},          // 11 laughing, open joyful eyes
 {E(87,135,17,31,-.14),E(153,135,17,31,.06)},         // 12 tearful downcast
 {E(86,133,28,5,.1),E(154,133,28,5,.1)},             // 13 closed, straight lids
 {E(84,120,19,34,.08),E(156,123,27,5,.2)},            // 14 puzzled
 {E(86,117,17,23,-.08),E(154,117,17,23,-.08)},        // 15 cool side glance
 {E(86,136,30,6,.1),E(154,138,30,6,.1)},             // 16 sad downcast
 {E(85,127,22,37,.1),E(155,127,22,37,.1)},            // 17 contentment
 {E(84,117,22,38,-.06),E(156,118,21,29,-.06)},        // 18 confidence
 {E(84,124,25,39,.08),E(156,124,25,39,.08)},          // 19 warm companionship
 {E(83,130,27,44,.14),E(157,130,27,44,.14)},          // 20 delighted
 {E(83,120,38,50,0,2),E(157,120,38,50,0,2)},         // 21 shocked round eyes
 {E(86,133,30,6,.12),E(154,135,30,6,.12)},           // 22 sleepy
 {E(84,124,29,5,.08),E(156,120,21,40,-.04)},          // 23 friendly wink, no hooked curve
 {E(98,143,12,17,0,2),E(142,143,12,17,0,2)},         // 24 shy tiny eyes
 {E(85,120,21,35),E(155,120,21,35)},                 // 25 look right
 {E(85,120,21,35),E(155,120,21,35)},                 // 26 look left
 {E(85,118,22,36),E(155,118,22,36)},                 // 27 look up
 {E(85,125,22,36),E(155,125,22,36)},                 // 28 look down
 {E(85,118,21,34),E(155,118,21,34)},                 // 29 upper left
 {E(85,118,21,34),E(155,118,21,34)},                 // 30 upper right
 {E(84,127,24,40,.1),E(156,127,24,40,.1)},           // 31 lower left, happy
 {E(84,127,24,40,-.08),E(156,127,24,40,-.08)},        // 32 lower right, happy
 {E(84,119,19,46,.12),E(156,119,19,46,.12)},          // 33 listening with a head tilt
 {E(95,138,13,19,0,2),E(145,138,13,19,0,2)},         // 34 shy, looking away
 {E(84,119,31,36,0,2),E(156,119,31,36,0,2)},         // 35 curious side look
 {E(84,121,20,32),E(156,124,27,5,.08)},              // 36 skeptical side eye
 {E(84,120,34,44,0,2),E(156,120,34,44,0,2)},         // 37 startled side look
 {E(85,133,28,6,.08),E(155,135,28,6,.08)},           // 38 bored downcast
 {E(84,121,25,44,-.08),E(156,121,25,44,-.08)},        // 39 eager upward glance
 {E(85,125,24,36,.08),E(155,125,24,36,.08)}           // 40 soft affectionate glance
}};
static const std::array<Facing,kPoseCount> facings = {{
 {.24f,.13f,-.09f},{.18f,.12f,-.06f},{-.28f,-.16f,.12f},{-.28f,.04f,-.06f},
 {.14f,-.12f,.06f},{.25f,.04f,-.13f},{.13f,-.08f,.07f},{0,-.02f,0},
 {.31f,.20f,-.15f},{-.24f,.03f,-.17f},{.12f,.07f,.12f},{-.22f,-.19f,.13f},
 {-.10f,-.18f,.04f},{.12f,-.16f,.06f},{.25f,.10f,.17f},{.34f,.12f,-.11f},
 {-.07f,-.18f,.05f},{.18f,-.14f,.07f},{.28f,.16f,-.08f},{-.18f,-.08f,.10f},
 {.18f,-.16f,-.10f},{-.32f,.03f,-.05f},{.18f,-.18f,.07f},{-.18f,.04f,-.10f},
 {.16f,-.13f,-.07f},{.48f,0,0},{-.48f,0,0},{0,.30f,0},{0,-.28f,0},
 {-.36f,.24f,-.07f},{.36f,.24f,.07f},{-.38f,-.22f,.10f},{.38f,-.22f,-.10f},
 {-.16f,.04f,.17f},{-.30f,-.18f,-.12f},{-.40f,.10f,.13f},{.40f,.02f,-.10f},
 {.38f,.08f,.06f},{-.24f,-.20f,-.05f},{.16f,.24f,-.08f},{.28f,-.10f,.12f}
}};
const Pose& GetPose(uint8_t id){return poses[id<kPoseCount?id:0];}
const Facing& GetPoseFacing(uint8_t id){return facings[id<kPoseCount?id:0];}
const std::array<Playlist,21> kEmotions = {{
 {"neutral",{0,25,26,0},3,6200},{"happy",{2,31,32,20},4,3200},{"laughing",{11,20,31,0},3,2600},
 {"funny",{5,32,23,0},3,3000},{"sad",{16,38,12,0},3,4000},{"angry",{7,36,0,0},2,3600},
 {"crying",{12,16,28,0},3,3800},{"loving",{19,40,17,0},3,4000},{"embarrassed",{24,34,28,0},3,3800},
 {"surprised",{3,35,37,0},3,3400},{"shocked",{21,37,3,0},3,3000},{"thinking",{8,29,30,27},4,3600},
 {"winking",{23,5,25,0},3,3200},{"cool",{15,25,26,0},3,4200},{"relaxed",{6,28,40,0},3,4200},
 {"delicious",{17,32,20,0},3,3600},{"kissy",{40,34,23,0},3,3600},{"confident",{18,30,39,0},3,3800},
 {"sleepy",{22,13,38,4},4,4400},{"silly",{5,32,14,0},3,3200},{"confused",{9,36,14,29},4,3400}
}};
}
