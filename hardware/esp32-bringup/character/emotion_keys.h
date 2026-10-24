#pragma once
#include <array>
#include <cstddef>
namespace round_eyes {
inline constexpr std::array<const char*,25> kEmotionKeys={
 "neutral","happy","laughing","funny","sad","angry","crying","loving","embarrassed","surprised","shocked","thinking","winking","cool","relaxed","delicious","kissy","confident","sleepy","silly","confused","wide_eyes","mega_eyes","giant_left","giant_right"
};
inline constexpr size_t kEmotionCount=kEmotionKeys.size();
}
