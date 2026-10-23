#pragma once
#include <cstdint>
#include <cstddef>
namespace companion {
void InitializeMode();bool Start();bool ConfirmPairing();bool Enabled();bool HandleToggle();
void OnWake();void OnPcm(const int16_t* data,size_t size);bool OnPlayback(uint32_t turn);void OnPlaybackEnd(uint32_t turn);
void Critical(bool active);void Tick();
}
