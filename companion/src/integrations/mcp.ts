import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';import {TOOL_SCHEMAS,toolAction} from './tools.js';import {daemonCall} from './daemon-client.js';
const server=new McpServer({name:'round-eyes',version:'0.1.0'});
const descriptions={list_devices:'列出已由主人USB配对的圆眼设备；不会扫描或授权任意设备。',get_status:'读取指定已授权设备的连接状态，不读取对话或凭据。',set_reaction:'发送受限表情，持有300至3000毫秒；busy或离线时不要抢占。',semantic_input:'理解提供的文字并反馈眼神，可返回回答文本；不启用麦克风或播放语音。'};
for(const name of Object.keys(TOOL_SCHEMAS) as (keyof typeof TOOL_SCHEMAS)[]){
 server.registerTool(name,{description:descriptions[name],inputSchema:TOOL_SCHEMAS[name].shape},async (input:unknown)=>{
  try{const action=toolAction(name,input);const value=await daemonCall(action.name,action.input);return {content:[{type:'text' as const,text:JSON.stringify(value)}]};}
  catch(error){const code=error instanceof Error&&/^[a-z_]+$/.test(error.message)?error.message:'tool_failed';return {isError:true,content:[{type:'text' as const,text:code}]};}
 });
}
await server.connect(new StdioServerTransport());
