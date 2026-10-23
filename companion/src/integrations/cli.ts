import {daemonCall} from './daemon-client.js';
const [command,...args]=process.argv.slice(2);
async function main(){switch(command){
 case 'discover':return daemonCall('discover');
 case 'devices':return daemonCall('list-devices');
 case 'pair':if(!args[0])throw new Error('usage_pair_serial_path');return daemonCall('pair',{path:args[0],host:args[1]??''});
 case 'connect':return daemonCall('connect',{device_id:args[0],activate:args.includes('--activate')});
 case 'status':return daemonCall(args[0]?'device-status':'status',{device_id:args[0]});
 case 'react':return daemonCall('react',{device_id:args[0],emotion:args[1],hold_ms:args[2]===undefined?1600:Number(args[2]),source:'agent'});
 case 'say':return daemonCall('text',{device_id:args[0],text:args.slice(1).filter(x=>x!=='--speak').join(' '),speak:args.includes('--speak')});
 case 'revoke-controller':return daemonCall('revoke-controller',{controller_id:args[0]});
 case 'release':return daemonCall('release');
 case 'interrupt':return daemonCall('interrupt');
 case 'mode':return daemonCall('mode',{mode:args[0]});
 default:return {usage:['round-eyes devices','round-eyes discover','round-eyes pair /dev/cu.usbmodemXXX [host]','round-eyes connect DEVICE --activate','round-eyes status [DEVICE]','round-eyes react DEVICE thinking 1600','round-eyes say DEVICE 你好 [--speak]','round-eyes interrupt','round-eyes release','round-eyes mode xiaozhi']};
}}
main().then(value=>process.stdout.write(JSON.stringify(value,null,2)+'\n')).catch(()=>{process.stderr.write('command_failed; check device connection and arguments\n');process.exitCode=1;});
