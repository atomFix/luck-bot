import Foundation
import AVFoundation
@main struct Output {
 static func main() {
  do {
   let engine=AVAudioEngine();let player=AVAudioPlayerNode()
   guard let format=AVAudioFormat(commonFormat:.pcmFormatFloat32,sampleRate:24000,channels:1,interleaved:false) else {exit(1)}
   engine.attach(player);engine.connect(player,to:engine.mainMixerNode,format:format);try engine.start();player.play()
   var carry=Data();var first=true
   let slots=DispatchSemaphore(value:8);let drained=DispatchGroup()
   while let bytes=try FileHandle.standardInput.read(upToCount:960), !bytes.isEmpty {
    carry.append(bytes);let count=carry.count/2;if count==0 {continue}
    guard slots.wait(timeout:.now()+3) == .success else {exit(1)}
    guard let buffer=AVAudioPCMBuffer(pcmFormat:format,frameCapacity:AVAudioFrameCount(count)),let out=buffer.floatChannelData else {exit(1)}
    buffer.frameLength=AVAudioFrameCount(count)
    let start=carry.startIndex
    for i in 0..<count {let raw=UInt16(carry[start+2*i])|UInt16(carry[start+2*i+1])<<8;out[0][i]=Float(Int16(bitPattern:raw))/32768}
    carry.removeFirst(count*2);drained.enter()
    let isFirst=first;first=false
    player.scheduleBuffer(buffer,completionCallbackType:.dataPlayedBack){_ in
     if isFirst {FileHandle.standardOutput.write(Data("playback.started\n".utf8))}
     slots.signal();drained.leave()
    }
   }
   guard drained.wait(timeout:.now()+3) == .success else {exit(1)}
   player.stop();engine.stop()
  } catch {exit(1)}
 }
}
