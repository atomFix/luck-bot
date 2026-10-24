(() => {
  const $ = (id) => document.getElementById(id);
  const labels = {
    completed: "完成",
    failed: "失败",
    cancelled: "取消",
    interrupted: "中断",
    ignored: "忽略",
    running: "进行中",
    voice: "唤醒聊天",
    ambient: "后台表情",
    text: "文字测试",
    estimated: "估算",
    provider_reported: "供应商实际金额",
    unknown: "未知",
    input_tokens: "输入 token",
    output_tokens: "输出 token",
    cache_hit_tokens: "缓存命中",
    cache_miss_tokens: "缓存未命中",
    total_tokens: "总 token",
    measured_audio_ms: "音频毫秒（测量）",
    measured_input_characters: "输入字符（测量）",
    measured_output_pcm_bytes: "PCM 字节（测量）",
  };
  let api,
    page = "overview",
    pagination = 1,
    listGeneration = 0;
  const titles = {
    overview: ["运行概览", "对话、反应和每次调用，都有迹可循。"],
    conversations: ["对话记录", "从听见一句话，到它作出的每一个回应。"],
    usage: ["用量与费用", "按请求追查用量，按来源区分费用。"],
    speakers: ["声纹与聆听", "认出熟悉的人，再理解他说的话。"],
    settings: ["设备与配置", "管理连接、模型服务与本机数据。"],
  };
  const node = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text != null) n.textContent = String(text);
    if (cls) n.className = cls;
    return n;
  };
  const ms = (v) =>
    v == null ? "未知" : v >= 1000 ? (v / 1000).toFixed(2) + " s" : v + " ms";
  const date = (v) =>
    v == null ? "—" : new Date(v).toLocaleString("zh-CN", { hour12: false });
  const label = (v) => labels[v] ?? v ?? "—";
  const today = () => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  };
  const admin = (op, input = {}) => api.call("admin", { op, input });
  const fail = (e) => api.notify(e.message);
  const costText = (costs) =>
    costs.length
      ? costs
          .map((c) => `${c.currency} ${c.amount} · ${label(c.kind)}`)
          .join(" / ")
      : "费用未知";
  function table(target, columns, rows) {
    const host = typeof target === "string" ? $(target) : target;
    host.replaceChildren();
    if (!rows.length) {
      host.append(node("div", "暂无记录", "empty"));
      return;
    }
    const t = node("table");
    const head = node("tr");
    columns.forEach((c) => head.append(node("th", c)));
    const thead = node("thead");
    thead.append(head);
    t.append(thead);
    const body = node("tbody");
    rows.forEach((values) => {
      const tr = node("tr");
      values.forEach((v) => {
        const td = node("td");
        td.append(v instanceof Node ? v : node("span", v ?? "—"));
        tr.append(td);
      });
      body.append(tr);
    });
    t.append(body);
    host.append(t);
  }
  function turnRows(items) {
    return items.map((t) => {
      const button = node("button", date(t.started_at), "text-link");
      button.onclick = () => {
        show("conversations", false);
        void detail(t.id).catch(fail);
      };
      return [
        button,
        label(t.mode),
        node("span", label(t.status), "status " + t.status),
        (t.user_text ?? "未保存 / 未识别").slice(0, 48),
        t.emotion ?? "—",
        ms(t.duration_ms),
        `${t.input_tokens ?? "?"} / ${t.output_tokens ?? "?"}`,
        t.attempts
          ? costText(t.costs) + (t.cost_incomplete ? " · 不完整" : "")
          : "无需云调用",
      ];
    });
  }
  function costs(host, s) {
    const target = $(host);
    target.replaceChildren();
    if (!s.costs.length)
      target.append(
        node(
          "p",
          "暂无已知金额；未配置价格或未返回用量的请求显示未知。",
          "muted",
        ),
      );
    else
      for (const c of s.costs)
        target.append(
          node(
            "div",
            `${label(c.kind)}　${c.currency} ${c.amount}`,
            "cost-line",
          ),
        );
    target.append(
      node(
        "p",
        `${s.attempts} 次供应商请求 · ${s.unknown_attempts} 次费用尚不完整。各币种分别统计。`,
        "muted",
      ),
    );
  }
  function health() {
    const s = api.state();
    $("recording-health").textContent = s.recording?.ok
      ? "● 记录正常"
      : s.recording
        ? "记录故障 · 新请求已暂停"
        : "记录状态未知";
    $("recording-health").classList.toggle(
      "error",
      s.recording && !s.recording.ok,
    );
  }
  async function overview() {
    const [s, recent] = await Promise.all([
      admin("summary", { from: today() }),
      admin("list", { page_size: 5 }),
    ]);
    $("overview-metrics").replaceChildren();
    for (const [name, value, note] of [
      [
        "今日对话",
        s.turns,
        `${s.statuses.completed ?? 0} 完成 · ${s.statuses.failed ?? 0} 失败`,
      ],
      ["供应商请求", s.attempts, "包含重试与每段语音合成"],
      [
        "响应中位数",
        ms(s.latency.p50),
        `${s.latency.n} 个已结束轮次 · 包含采集`,
      ],
      ["费用待确认", s.unknown_attempts, "未知费用不计为零"],
    ]) {
      const card = node("div", null, "metric");
      card.append(
        node("span", name),
        node("strong", value),
        node("small", note),
      );
      $("overview-metrics").append(card);
    }
    table(
      "recent-turns",
      [
        "开始时间",
        "模式",
        "状态",
        "用户说了什么",
        "表情",
        "总耗时",
        "Token 入 / 出",
        "费用（已知小计）",
      ],
      turnRows(recent.items),
    );
    costs("overview-costs", s);
    health();
  }
  function filters() {
    const f = { page: pagination, page_size: Number($("page-size").value) };
    for (const [id, key] of [
      ["filter-mode", "mode"],
      ["filter-status", "status"],
      ["filter-device", "device_id"],
      ["filter-speaker", "speaker_id"],
      ["filter-q", "q"],
    ])
      if ($(id).value) f[key] = $(id).value;
    if ($("filter-from").value)
      f.from = new Date($("filter-from").value + "T00:00:00").getTime();
    if ($("filter-to").value) {
      const end = new Date($("filter-to").value + "T00:00:00");
      end.setDate(end.getDate() + 1);
      f.to = end.getTime();
    }
    return f;
  }
  async function conversations() {
    const generation = ++listGeneration;
    const data = await admin("list", filters());
    if (generation !== listGeneration) return;
    table(
      "turn-table",
      [
        "开始时间",
        "模式",
        "状态",
        "识别文字",
        "表情",
        "总耗时",
        "Token 入 / 出",
        "费用（已知小计）",
      ],
      turnRows(data.items),
    );
    $("turn-count").textContent =
      `共 ${data.total} 条 · 第 ${data.page} / ${Math.max(1, Math.ceil(data.total / data.page_size))} 页`;
    $("prev-page").disabled = pagination <= 1;
    $("next-page").disabled = pagination * data.page_size >= data.total;
  }
  async function detail(id) {
    const d = await admin("detail", { id });
    const host = $("turn-detail");
    host.replaceChildren();
    host.hidden = false;
    host.append(
      node("h2", "本轮详情"),
      node(
        "p",
        `${date(d.turn.started_at)} · ${label(d.turn.mode)} · ${label(d.turn.status)} · ${ms(d.turn.duration_ms)}`,
        "muted",
      ),
      node(
        "p",
        `设备：${d.turn.device_id ?? "无"}　说话人：${d.turn.speaker_name ?? "未识别 / 未启用"}`,
        "muted",
      ),
    );
    for (const [title, text] of [
      ["识别文字", d.turn.user_text ?? "未保存 / 未识别"],
      [
        "回应文字",
        d.turn.reply_text ??
          (d.turn.mode === "ambient"
            ? "纯表情轮次，无需文字或声音回答"
            : "没有回答 / 未保存"),
      ],
      [
        "表情与结果",
        `${d.turn.emotion ?? "无"}${d.turn.hold_ms ? " · " + d.turn.hold_ms + "ms" : ""}${d.turn.error ? " · " + d.turn.error : ""}`,
      ],
    ]) {
      host.append(node("h3", title), node("pre", text, "transcript"));
    }
    host.append(node("h3", "阶段时间线"));
    const spans = node("div", null, "table-wrap");
    table(
      spans,
      ["阶段", "距采集开始", "阶段耗时", "结果"],
      d.spans.map((s) => [
        s.event,
        ms(s.at_ms),
        ms(s.duration_ms),
        s.meta?.code ??
          (s.meta?.bytes != null ? s.meta.bytes + " PCM 字节" : "—"),
      ]),
    );
    host.append(
      spans,
      node(
        "p",
        "playback.started 为软件首缓冲区播放观察；不代表外部声学延迟。",
        "muted",
      ),
      node("h3", "供应商请求明细"),
    );
    const requests = node("div", null, "table-wrap");
    table(
      requests,
      ["阶段 / 服务商", "模型", "状态 / 耗时", "用量", "费用来源"],
      d.attempts.map((a) => [
        `${a.kind} / ${a.provider}`,
        a.actual_model ?? a.model,
        `${label(a.status)} · ${ms(a.duration_ms)}${a.error ? " · " + a.error : ""}`,
        a.usage
          ? Object.entries(a.usage)
              .map(([k, v]) => `${label(k)}: ${v}`)
              .join("\n")
          : "未知",
        costText(a.costs),
      ]),
    );
    host.append(requests);
    host.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function usage() {
    const s = await admin(
      "summary",
      $("usage-range").value === "today" ? { from: today() } : {},
    );
    costs("usage-summary", s);
    table(
      "model-usage",
      [
        "服务商 / 模型",
        "请求次数",
        "用量未知",
        "计量项（按供应商/本机来源区分）",
      ],
      s.by_model.map((m) => [
        m.provider + " / " + m.model,
        m.attempts,
        m.unknown_usage,
        Object.entries(m.usage)
          .map(([k, v]) => `${label(k)}: ${v}`)
          .join("\n"),
      ]),
    );
    const prices = await admin("prices");
    table(
      "price-table",
      ["服务商 / 模型", "计量项", "价格 / 单位", "生效时间", "来源"],
      prices.map((p) => [
        p.provider + " / " + p.model,
        label(p.metric),
        `${p.currency} ${p.price} / ${p.unit}`,
        date(p.effective_at),
        p.note ?? "未备注",
      ]),
    );
  }
  const speaker = (op, input = {}) => api.call("speaker", {op,input});
  const speakerLabels={disabled:"后台已关闭",paused:"已暂停",starting:"启动中",listening:"持续聆听中",enrolling:"声纹录入中",fault:"需要处理",no_profiles:"请先录入声纹",unavailable:"组件不可用"};
  let speakerLoading=false, speakerInitialized=false;
  async function speakers(){
    if(speakerLoading)return;speakerLoading=true;
    try{const value=await speaker("list");
      $("speaker-state").textContent=speakerLabels[value.state]??value.state;
      $("speaker-status").textContent=`本地模型：${value.model.ready?"已就绪":"待加载"} · 启用档案 ${value.profile_count} 人 · 本次检测 ${value.local_utterances} 句`+(value.error?" · "+value.error:"")+(value.last_event?" · 最近结果："+value.last_event:"");
      const host=$("speaker-profiles");host.replaceChildren();
      if(!value.profiles.length)host.append(node("p","还没有声纹档案。完成下方三段录入后即可启用。","muted"));
      for(const person of value.profiles){const row=node("div",null,"row"),check=node("input");check.type="checkbox";check.checked=person.enabled;check.setAttribute("aria-label","启用 "+person.name);check.onchange=()=>speakerRun(check,()=>speaker("profile-enable",{id:person.id,enabled:check.checked}));const remove=node("button","删除","quiet");remove.onclick=()=>{if(confirm("删除声纹档案“"+person.name+"”？"))void speakerRun(remove,()=>speaker("profile-remove",{id:person.id}));};row.append(check,node("strong",person.name),node("small",person.id),remove);host.append(row);}
      const model=api.state().local_asr;$("local-asr-status").textContent=model?`本地识别：${model.ready?"已就绪":"待加载"} · ${model.model}`+(model.error?" · "+model.error:""):"本地识别组件不可用";
      const e=value.enrollment,active=e&&!['complete'].includes(e.state);
      $("speaker-enroll").disabled=!!active;$("speaker-name").disabled=!!active;$("speaker-cancel").hidden=!active;$("speaker-next").hidden=!e||!['next_sample','failed'].includes(e.state);
      $("speaker-next").textContent=e?.state==='failed'?"重试这一段":"开始下一段";
      $("speaker-enrollment").textContent=!e?"准备好后开始第一段。":e.state==='recording'?`第 ${e.samples+1}/3 段：请自然说话，还剩 ${Math.max(0,Math.ceil((e.until-Date.now())/1000))} 秒`:e.state==='analyzing'?"正在本地检查音量与声纹…":e.state==='complete'?"三段录入完成，声纹已保存。":e.state==='failed'?"这一段未通过："+e.error+"。请调整距离后重试。":`已完成 ${e.samples}/3 段，请开始下一段。`;
      if(!speakerInitialized){const cfg=api.state().settings.ambient;$("ambient-enabled").checked=cfg.enabled;$("local-asr").checked=api.state().settings.performance.local_asr;$("fast-reactions").checked=api.state().settings.performance.fast_reactions;$("ambient-wait").value=cfg.wait_seconds;$("ambient-silence").value=cfg.silence_ms;$("ambient-threshold").value=cfg.threshold;$("ambient-margin").value=cfg.margin;speakerInitialized=true;}
    }finally{speakerLoading=false;}
  }
  async function speakerRun(button,fn){button.disabled=true;try{await fn();await api.refresh();await speakers();}catch(e){fail(e);}finally{button.disabled=false;}}
  $("speaker-enroll").onclick=e=>speakerRun(e.currentTarget,()=>speaker("enroll-start",{name:$("speaker-name").value.trim(),enable_after:$("speaker-enable-after").checked}));
  $("speaker-next").onclick=e=>speakerRun(e.currentTarget,()=>speaker("enroll-next"));
  $("speaker-cancel").onclick=e=>speakerRun(e.currentTarget,()=>speaker("enroll-cancel"));
  async function saveFast(preset=false){await api.refresh();const cfg=api.state().settings;await api.call("settings",{...cfg,performance:{local_asr:preset||$("local-asr").checked,fast_reactions:preset||$("fast-reactions").checked},ambient:{...cfg.ambient,...(preset?{silence_ms:600}:{})}});await api.refresh();speakerInitialized=false;api.notify("加速设置已保存，正在恢复聆听。");}
  $("fast-settings").onsubmit=e=>{e.preventDefault();void speakerRun(e.submitter,()=>saveFast());};
  $("fast-preset").onclick=e=>speakerRun(e.currentTarget,()=>saveFast(true));
  $("speaker-settings").onsubmit=e=>{e.preventDefault();void speakerRun(e.submitter,()=>speaker("settings",{enabled:$("ambient-enabled").checked,wait_seconds:Number($("ambient-wait").value),silence_ms:Number($("ambient-silence").value),threshold:Number($("ambient-threshold").value),margin:Number($("ambient-margin").value)}));};
  async function show(name, load = true) {
    if (!titles[name]) return;
    page = name;
    window.dispatchEvent(new Event("roundeyes:page"));
    document
      .querySelectorAll("[data-view]")
      .forEach((n) => (n.hidden = n.dataset.view !== name));
    document.querySelectorAll("[data-page]").forEach((n) => {
      n.classList.toggle("selected", n.dataset.page === name);
      n.setAttribute(
        "aria-current",
        n.dataset.page === name ? "page" : "false",
      );
    });
    $("page-title").textContent = titles[name][0];
    $("page-subtitle").textContent = titles[name][1];
    if (!api || !load) return;
    try {
      health();
      if (name === "overview") await overview();
      if (name === "conversations") await conversations();
      if (name === "usage") await usage();
      if (name === "speakers") {speakerInitialized=false;await speakers();}
      if (name === "settings")
        $("record-text").checked = (await admin("privacy")).record_text;
    } catch (e) {
      fail(e);
    }
  }
  document
    .querySelectorAll("[data-page],[data-goto]")
    .forEach(
      (b) => (b.onclick = () => void show(b.dataset.page ?? b.dataset.goto)),
    );
  $("turn-filters").onsubmit = (e) => {
    e.preventDefault();
    pagination = 1;
    void conversations().catch(fail);
  };
  $("page-size").onchange = () => {
    pagination = 1;
    void conversations().catch(fail);
  };
  $("prev-page").onclick = () => {
    pagination--;
    void conversations().catch(fail);
  };
  $("next-page").onclick = () => {
    pagination++;
    void conversations().catch(fail);
  };
  $("usage-range").onchange = () => void usage().catch(fail);
  $("price-form").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.submitter;
    button.disabled = true;
    try {
      await admin("savePrice", {
        provider: $("price-provider").value,
        model: $("price-model").value.trim(),
        metric: $("price-metric").value,
        currency: $("price-currency").value,
        unit: Number($("price-unit").value),
        price: $("price-value").value.trim(),
        note: $("price-note").value.trim(),
      });
      api.notify("价格新版本已保存；历史请求保持原价格快照。");
      await usage();
    } catch (e) {
      fail(e);
    } finally {
      button.disabled = false;
    }
  };
  $("record-text").onchange = async () => {
    try {
      await admin("privacy", { record_text: $("record-text").checked });
      api.notify("正文保存设置已更新。");
    } catch (e) {
      $("record-text").checked = !$("record-text").checked;
      fail(e);
    }
  };
  $("clear-records").onclick = async () => {
    try {
      if (!$("clear-before").value) throw Error("请选择清理日期");
      const input = {
        before: new Date($("clear-before").value + "T00:00:00").getTime(),
        scope: $("clear-scope").value,
      };
      const preview = await admin("clear", input);
      if (!preview.count) {
        api.notify("该范围没有可清理的已结束记录。");
        return;
      }
      if (
        !confirm(
          `将${input.scope === "text" ? "清理正文，保留用量" : "删除完整记录并影响统计"}：${preview.count} 条，日期早于 ${$("clear-before").value}。确认继续？`,
        )
      )
        return;
      await admin("clear", { ...input, confirm: preview.confirmation });
      api.notify("所选记录已清理。");
    } catch (e) {
      fail(e);
    }
  };
  window.addEventListener("roundeyes:ready", () => {
    api = window.roundEyesApi;
    void show(page);
    setInterval(()=>{if(page==="speakers")void speakers().catch(fail);},1000);
    setInterval(() => {
      health();
      if (page === "overview") void overview().catch(fail);
    }, 5000);
  });
})();
