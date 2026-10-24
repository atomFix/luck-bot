import {StreamPayload} from '../ledger/payloads.mjs';
import { finishResponse, usageFrom } from "../ledger/journal.js";
import type { Brain, Reaction, Message } from "../contracts.js";
import { parseReaction } from "../protocol/schema.js";
import { request, sse, readModelBody, type Fetch } from "./http.js";
import { REACTION_PROMPT, REPLY_PROMPT } from "./prompts.js";
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
  ) {
    const payload = {
      model: this.options.model ?? "deepseek-flash",
      thinking: { type: "disabled" },
      stream: !reaction,
      ...(!reaction ? { stream_options: { include_usage: true } } : {}),
      max_tokens: reaction ? 128 : 512,
      messages: [
        {role:"system",content:reaction ? REACTION_PROMPT : REPLY_PROMPT},
        ...history,
        {role:"user",content:text},
      ],
      ...(reaction ? {response_format:{type:"json_object"}} : {}),
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
  async reaction(
    text: string,
    history: Message[],
    signal: AbortSignal,
  ): Promise<Reaction> {
    const response = await this.call(text, history, signal, true);
    let body: any;
    let raw:{text:string;truncated:boolean}|undefined;
    try {
      raw = await readModelBody(response);
      if(raw.truncated)throw new Error("provider_size");
      body = JSON.parse(raw.text);
    } catch (e) {
      await finishResponse(response, "failed", { error: "provider_format", response_data:raw?{format:"text",body:raw.text,truncated:raw.truncated}:{unavailable:"body_unreadable"} });
      throw e;
    }
    await finishResponse(response, "completed", {
      usage: usageFrom(body.usage),
      actual_model: body.model,
      request_id: body.id,
      response_data: body,
    });
    this.options.diagnose?.({
      event: "brain.reaction",
      model: this.options.model ?? "deepseek-flash",
      input_tokens: body.usage?.prompt_tokens,
      output_tokens: body.usage?.completion_tokens,
    });
    try {
      return parseReaction(JSON.parse(body.choices?.[0]?.message?.content));
    } catch {
      return { emotion: "neutral", hold_ms: 1200 };
    }
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
