import Foundation
import Darwin
@main struct SerialPair {
 static func main() {
  guard CommandLine.arguments.count==2 else {exit(1)}
  let path=CommandLine.arguments[1];guard path.hasPrefix("/dev/cu.usb"),!path.contains("..") else {exit(1)}
  let fd=open(path,O_RDWR|O_NOCTTY|O_NONBLOCK);guard fd>=0 else {exit(1)};defer{close(fd)}
  var attrs=termios();guard tcgetattr(fd,&attrs)==0 else {exit(1)};cfmakeraw(&attrs);attrs.c_cflag |= tcflag_t(CLOCAL|CREAD);cfsetispeed(&attrs,speed_t(B115200));cfsetospeed(&attrs,speed_t(B115200));guard tcsetattr(fd,TCSANOW,&attrs)==0 else {exit(1)}
  let request=Array("\nREYE/1 {\"op\":\"pair\"}\n".utf8);guard write(fd,request,request.count)==request.count else {exit(1)}
  let end=Date().addingTimeInterval(35);var line=Data();var bytes=[UInt8](repeating:0,count:256)
  while Date()<end {
   let count=read(fd,&bytes,bytes.count)
   if count<=0 {usleep(10000);continue}
   for ch in bytes.prefix(count) {
    if ch==10 || ch==13 {
     if let text=String(data:line,encoding:.utf8),text.hasPrefix("REYE/1 "),let data=text.dropFirst(7).data(using:.utf8),let obj=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any] {
      FileHandle.standardOutput.write(data);FileHandle.standardOutput.write(Data([10]));
      if obj["type"] as? String == "pairing.complete" {return}
     };line.removeAll(keepingCapacity:true)
    } else {line.append(ch);if line.count>4096 {line.removeAll(keepingCapacity:true)}}
   }
  }
  exit(2)
 }
}
