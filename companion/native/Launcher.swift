import AppKit
import Foundation
import Darwin
final class Delegate:NSObject,NSApplicationDelegate {
 var child:Process?;var item:NSStatusItem?
 let data=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Round Eyes Companion")
 func readLaunch()->[String:Any]?{guard let bytes=try? Data(contentsOf:data.appendingPathComponent("launch.json")) else{return nil};return (try? JSONSerialization.jsonObject(with:bytes)) as? [String:Any]}
 @objc func copySettingsLink(){
  let resources=Bundle.main.resourceURL!
  DispatchQueue.global().async {
   let task=Process();let pipe=Pipe();task.executableURL=resources.appendingPathComponent("node");task.arguments=[resources.appendingPathComponent("app/dist/src/integrations/open-ui.js").path];task.standardOutput=pipe;task.standardError=FileHandle.nullDevice
   do {try task.run();let data=pipe.fileHandleForReading.readDataToEndOfFile();task.waitUntilExit();guard task.terminationStatus==0,let obj=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any],let raw=obj["url"] as? String,let url=URL(string:raw) else{return};DispatchQueue.main.async{NSPasteboard.general.clearContents();NSPasteboard.general.setString(url.absoluteString,forType:.string)}}catch{}
  }
 }
 @objc func quit(){child?.terminate();NSApplication.shared.terminate(nil)}
 func applicationDidFinishLaunching(_ notification:Notification){
  item=NSStatusBar.system.statusItem(withLength:NSStatusItem.variableLength);item?.button?.title="◉"
  let menu=NSMenu();menu.addItem(withTitle:"复制后台管理链接",action:#selector(copySettingsLink),keyEquivalent:"").target=self;menu.addItem(NSMenuItem.separator());menu.addItem(withTitle:"退出 Companion",action:#selector(quit),keyEquivalent:"q").target=self;item?.menu=menu
  let resources=Bundle.main.resourceURL!;let old=readLaunch()
  if let pid=old?["pid"] as? Int32,kill(pid,0)==0 {return}
  let task=Process();task.executableURL=resources.appendingPathComponent("node");task.arguments=[resources.appendingPathComponent("app/dist/src/main.js").path];task.standardOutput=FileHandle.nullDevice;task.standardError=FileHandle.nullDevice;var env=ProcessInfo.processInfo.environment;env["ROUND_EYES_APP_PATH"]=Bundle.main.bundlePath;task.environment=env
  task.terminationHandler={_ in DispatchQueue.main.async{NSApplication.shared.terminate(nil)}}
  do {try task.run();child=task;Task {for _ in 0..<100 {try? await Task.sleep(for:.milliseconds(100));if let obj=readLaunch(),let pid=obj["pid"] as? Int32,pid==task.processIdentifier,obj["url"] is String {return}}}} catch{NSApplication.shared.terminate(nil)}
 }
 func applicationShouldHandleReopen(_ sender:NSApplication,hasVisibleWindows flag:Bool)->Bool{return false}
}
@main struct Launcher {static func main(){let app=NSApplication.shared;app.setActivationPolicy(.accessory);let delegate=Delegate();app.delegate=delegate;app.run();withExtendedLifetime(delegate){}}}
