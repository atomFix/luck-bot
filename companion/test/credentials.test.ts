import test from 'node:test';import assert from 'node:assert/strict';
import {KeychainSecrets} from '../src/secrets.js';
test('native helper protocol stores retrieves and removes without command arguments', async()=>{
 const store=new KeychainSecrets();const name='provider/test-'+crypto.randomUUID();
 try{await store.set(name,'sentinel-test-only');assert.equal(await store.get(name),'sentinel-test-only');await store.delete(name);assert.equal(await store.get(name),null);}finally{await store.delete(name);}
});
test('credential names cannot traverse service or request arbitrary helper operations',async()=>{
 const store=new KeychainSecrets();await assert.rejects(store.set('../other-service','x'));
});
test('credential presence is available without fetching the protected value',async()=>{const store=new KeychainSecrets();const name='provider/test-'+crypto.randomUUID();try{await store.set(name,'sentinel-test-only');assert.equal(await store.has(name),true);await store.delete(name);assert.equal(await store.has(name),false);}finally{await store.delete(name);}});
