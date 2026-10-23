import {daemonCall} from './daemon-client.js';
// stdout is a private pipe to the native launcher, never a diagnostic log.
try {const result=await daemonCall('open-ui',{},undefined,5000);process.stdout.write(JSON.stringify(result));}
catch{process.exitCode=1;}
