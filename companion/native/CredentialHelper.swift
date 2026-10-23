import Foundation
@main struct Helper {
 static func readExactly(_ count: Int) throws -> Data {
   var data=Data()
   while data.count<count {
     guard let chunk=try FileHandle.standardInput.read(upToCount:count-data.count), !chunk.isEmpty else {throw CredentialFailure(code:-50)}
     data.append(chunk)
   }
   return data
 }
 static func main() {
   do {
     let header=try readExactly(4)
     let size=header.reduce(UInt32(0)){($0<<8)|UInt32($1)}
     guard size>0,size<=8192 else {throw CredentialFailure(code:-50)}
     let obj=try JSONSerialization.jsonObject(with:readExactly(Int(size)))
     guard let req=obj as? [String:Any], let op=req["op"] as? String, let name=req["name"] as? String,
       name.hasPrefix("provider/") || name.hasPrefix("device/") else {throw CredentialFailure(code:-50)}
     let store=CredentialStore(service:"com.roundeyes.companion")
     var result:[String:Any]=["ok":true]
     switch op {
     case "has": result["exists"]=try store.contains(name)
     case "get": result["value"]=(try store.get(name)).map{$0 as Any} ?? NSNull()
     case "set": guard let value=req["value"] as? String else {throw CredentialFailure(code:-50)}; try store.set(name,value)
     case "delete": try store.delete(name)
     default: throw CredentialFailure(code:-50)
     }
     let data=try JSONSerialization.data(withJSONObject:result)
     var length=UInt32(data.count).bigEndian
     try FileHandle.standardOutput.write(contentsOf:Data(bytes:&length,count:4))
     try FileHandle.standardOutput.write(contentsOf:data)
   } catch {
     // Neither request contents nor OS error strings enter diagnostics.
     FileHandle.standardError.write(Data("credential_operation_failed\n".utf8)); exit(1)
   }
 }
}
