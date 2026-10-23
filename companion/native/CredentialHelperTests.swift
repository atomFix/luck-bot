import Foundation
@main struct Tests {
 static func main() throws {
   let store = CredentialStore(service:"com.roundeyes.companion.tests")
   let name="test/"+UUID().uuidString
   defer {try? store.delete(name)}
   try store.set(name,"sentinel-test-only")
   let first = try store.get(name); precondition(first=="sentinel-test-only")
   try store.set(name,"updated-test-only")
   let updated = try store.get(name); precondition(updated=="updated-test-only")
   try store.delete(name)
   let removed = try store.get(name); precondition(removed==nil)
   print("Keychain set/update/get/delete passed")
 }
}
