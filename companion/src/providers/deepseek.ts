import {StreamPayload} from '../ledger/payloads.mjs';
import { finishResponse, usageFrom } from "../ledger/journal.js";
import type { Brain, Reaction, Message } from "../contracts.js";
import { parseReaction } from "../protocol/schema.js";
import { request, sse, readModelBody, type Fetch } from "./http.js";
import { REACTION_PROMPT, REPLY_PROMPT, ANIMATION_PROMPT } from "./prompts.js";
import {parseAnimationChoice,type AnimationPlan} from '../voice/animation.js';
export class DeepSeekBrain implements Brain {
  private fetcher: Fetch;
  constructor(
    private options: {
      key: string;
      fetch?: Fetch;
      model?: string;
      diagnose?: (meta: any) => void;
    },
  ) {
    this.fetcher = options.fetch ?? fetch;
  }
  private call(
    text: string,
    history: Message[],
    signal: AbortSignal,
    reaction: boolean,
    repair = false,
    animation = false,
  ) {
    const payload = {
      model: this.options.model ?? "deepseek-flash",
      thinking: { type: "disabled" },
      stream: !reaction,
      ...(!reaction ? { stream_options: { include_usage: true } } : {}),
      max_tokens: reaction ? (animation ? 768 : 128) : 512,
      messages: reaction ? [
        {role:"system",content:(animation?ANIMATION_PROMPT:REACTION_PROMPT)+(repair?"\n上次输出未通过校验。这次必须返回一个非空 JSON 对象，例如一个符合上述schema的JSON对象；不要只返回空白。":"")},
        // Prior eye labels are context data, not invalid assistant JSON examples.
        {role:"user",content:JSON.stringify({recent_interactions:history,user_utterance:text})},
      ] : [
        {role:"system",content:REPLY_PROMPT},...history,{role:"user",content:text},
      ],
      ...(reaction&&!repair ? {response_format:{type:"json_object"}} : {}),
    };
    return request(
      this.fetcher,
      "https://api.deepseek.com/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      signal,
      reaction ? 8000 : 20000,
      {
        request_data: payload,
        kind: reaction ? "reaction" : "reply",
        provider: "deepseek",
        model: this.options.model ?? "deepseek-flash",
      },
    );
  }
  async reaction(text:string,history:Message[],signal:AbortSignal):Promise<Reaction>{return await this.structured(text,history,signal) as Reaction;}
  async animation(text:string,history:Message[],signal:AbortSignal):Promise<AnimationPlan>{return await this.structured(text,history,signal,true) as AnimationPlan;}
  private async structured(
    text: string,
    history: Message[],
    signal: AbortSignal,
    animation=false,
  ): Promise<Reaction|AnimationPlan> {
    for(let attempt=0;attempt<2;attempt++) {
      const response = await this.call(text, history, signal, true, attempt>0, animation);
      let body:any, raw:{text:string;truncated:boolean}|undefined;
      try {
        raw=await readModelBody(response);
        if(raw.truncated)throw new Error("provider_size");
        body=JSON.parse(raw.text);
      } catch(e) {
        await finishResponse(response,"failed",{error:"provider_format",response_data:raw?{format:"text",body:raw.text,truncated:raw.truncated}:{unavailable:"body_unreadable"}});
        throw e;
      }
      const content=body.choices?.[0]?.message?.content;
      let reaction:Reaction|AnimationPlan|undefined;
      try {if(typeof content==="string"&&content.trim())reaction=animation?parseAnimationChoice(JSON.parse(content)):parseReaction(JSON.parse(content));} catch {}
      const error=typeof content!=="string"||!content.trim()?"provider_reaction_empty":"provider_reaction_format";
      await finishResponse(response,reaction?"completed":"failed",{
        ...(reaction?{}:{error}),usage:usageFrom(body.usage),actual_model:body.model,request_id:body.id,response_data:body,
      });
      this.options.diagnose?.({event:reaction?"brain.reaction":"brain.reaction.invalid",model:this.options.model??"deepseek-flash",input_tokens:body.usage?.prompt_tokens,output_tokens:body.usage?.completion_tokens,...(reaction?{}:{code:error})});
      if(reaction)return reaction;
      signal.throwIfAborted();
      if(attempt===1)throw new Error(error);
    }
    throw new Error("provider_reaction_format");
  }

  async *reply(
    text: string,
    history: Message[],
    signal: AbortSignal,
  ): AsyncIterable<string> {
    const response = await this.call(text, history, signal, false);
    const trace = new StreamPayload();
    let usage: Record<string, number> = {},
      actual_model,
      request_id;
    let completed = false;
    try {
      for await (const part of sse(response, signal)) {
        trace.push(part);
        if (part.usage) usage = usageFrom(part.usage);
        actual_model = part.model ?? actual_model;
        request_id = part.id ?? request_id;
        const content = part.choices?.[0]?.delta?.content;
        if (typeof content === "string" && content) yield content;
      }
      completed = true;
    } finally {
      await finishResponse(
        response,
        completed ? "completed" : signal.aborted ? "cancelled" : "interrupted",
        { usage, actual_model, request_id, response_data: trace.snapshot(completed) },
      );
    }
  }
}
