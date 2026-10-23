import Foundation
import Security
struct CredentialFailure: Error { let code: OSStatus }
struct CredentialStore {
 let service: String
 private func query(_ name: String) throws -> [String:Any] {
   guard !name.isEmpty, name.utf8.count <= 256, !name.contains("\0") else {throw CredentialFailure(code:errSecParam)}
   return [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:name]
 }
 func contains(_ name: String) throws -> Bool {
   var q=try query(name); q[kSecMatchLimit as String]=kSecMatchLimitOne
   let status=SecItemCopyMatching(q as CFDictionary,nil)
   if status==errSecItemNotFound {return false}
   guard status==errSecSuccess else {throw CredentialFailure(code:status)}
   return true
 }
 func get(_ name: String) throws -> String? {
   var q=try query(name); q[kSecReturnData as String]=true; q[kSecMatchLimit as String]=kSecMatchLimitOne
   var result: CFTypeRef?; let status=SecItemCopyMatching(q as CFDictionary,&result)
   if status==errSecItemNotFound {return nil}
   guard status==errSecSuccess, let data=result as? Data, let value=String(data:data,encoding:.utf8) else {throw CredentialFailure(code:status)}
   return value
 }
 func set(_ name: String,_ value: String) throws {
   guard !value.isEmpty, value.utf8.count <= 4096 else {throw CredentialFailure(code:errSecParam)}
   let q=try query(name); let data=Data(value.utf8)
   let status=SecItemUpdate(q as CFDictionary,[kSecValueData as String:data] as CFDictionary)
   if status==errSecItemNotFound {
     var add=q; add[kSecValueData as String]=data
     add[kSecAttrAccessible as String]=kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
     let added=SecItemAdd(add as CFDictionary,nil)
     guard added==errSecSuccess else {throw CredentialFailure(code:added)}
   } else if status != errSecSuccess {throw CredentialFailure(code:status)}
 }
 func delete(_ name: String) throws {
   let status=SecItemDelete(try query(name) as CFDictionary)
   guard status==errSecSuccess || status==errSecItemNotFound else {throw CredentialFailure(code:status)}
 }
}
