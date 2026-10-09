// assets/studio.js — 提示词工坊主界面
//
// 同一份代码同时服务两个宿主：卡片（card.html）和输入框上方面板（panel.html）。
// 面板外壳那层收起/展开由 panel-shell.js 负责，这里只管内容。
import { hana } from "./sdk.js";
import { diffRows } from "./diff.js";
import { apiFetch, clientLog, postJson } from "./app-api.js";

const MAX_INPUT = 8000;

const state = {
  modes: [
    { id: "basic", label: "基础优化", hint: "消除模糊、补齐关键信息，改动最小" },
    { id: "professional", label: "专业优化", hint: "把泛泛而谈变成具体、可验收的要求" },
    { id: "planning", label: "步骤化规划", hint: "拆成角色、背景、步骤与输出要求的完整结构" },
  ],
  mode: "basic",
  addRole: false,
  result: "",
  resultMode: "",
  /** 这一版结果是从哪来的：优化档是输入框原文，迭代档是上一版结果。对比视图拿它当左栏 */
  base: "",
  /** 结果区当前是“看结果”还是“看对比” */
  compare: false,
  running: false,
};

const el = (id) => document.getElementById(id);

function esc(text) {
  return String(text ?? "");
}

function setStatus(message, tone) {
  const node = el("status");
  if (!node) return;
  node.textContent = message || "";
  if (tone) node.dataset.tone = tone;
  else delete node.dataset.tone;
}

function currentMode() {
  return state.modes.find((item) => item.id === state.mode) || state.modes[0];
}

function modeLabelOf(id) {
  if (id === "iterate") return "迭代改进";
  const hit = state.modes.find((item) => item.id === id);
  return hit ? hit.label : String(id || "");
}

/** 档位按钮与说明文字 */
function renderModes() {
  const box = el("modes");
  box.textContent = "";
  for (const mode of state.modes) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ps-mode";
    btn.dataset.mode = mode.id;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(mode.id === state.mode));
    btn.innerHTML = `${esc(mode.label)}<span class="ps-mode-sub">${esc(mode.hint || "")}</span>`;
    btn.addEventListener("click", () => selectMode(mode.id));
    box.appendChild(btn);
  }
  const hint = el("hint");
  if (hint) hint.textContent = currentMode().hint || "";
}

function selectMode(modeId) {
  if (state.mode === modeId) return;
  state.mode = modeId;
  renderModes();
  void savePrefs();
}

function renderCounter() {
  const input = el("input");
  const node = el("count");
  if (!input || !node) return;
  node.textContent = `${input.value.length} / ${MAX_INPUT}`;
}

function renderResult() {
  const out = el("out");
  const diff = el("diff");
  const tag = el("tag");
  const copy = el("copy");
  const compare = el("compare");
  const iterateRow = el("iterateRow");
  if (!out) return;

  const hasResult = Boolean(state.result);
  // 没有可比的原文、或两边一模一样时，对比按钮就是死的
  const canCompare = hasResult && Boolean(state.base) && state.base !== state.result;
  if (!canCompare) state.compare = false;

  if (hasResult) {
    out.textContent = state.result;
    out.dataset.empty = "false";
    if (tag) {
      tag.textContent = modeLabelOf(state.resultMode);
      tag.hidden = false;
    }
    if (copy) copy.disabled = false;
  } else {
    out.textContent = "还没有结果。写下你的基础提示词，选一档，点「优化」。";
    out.dataset.empty = "true";
    if (tag) tag.hidden = true;
    if (copy) copy.disabled = true;
  }

  if (compare) {
    compare.disabled = !canCompare;
    compare.textContent = state.compare ? "看结果" : "对比";
  }
  if (iterateRow) iterateRow.hidden = !hasResult;

  out.hidden = state.compare;
  if (diff) diff.hidden = !state.compare;
  if (state.compare) renderDiff();
}

/* ── 后端交互 ───────────────────────────────────────────── */

async function loadMeta() {
  try {
    const meta = await apiFetch("meta");
    if (Array.isArray(meta?.modes) && meta.modes.length) state.modes = meta.modes;
    if (meta?.prefs) {
      state.mode = meta.prefs.mode || state.mode;
      state.addRole = meta.prefs.addRole === true;
    }
  } catch (err) {
    clientLog(`loadMeta 失败: ${String(err?.message || err)}`);
  }
  renderModes();
  const sw = el("addRole");
  if (sw) sw.checked = state.addRole;
}

async function savePrefs() {
  try {
    await postJson("prefs", { mode: state.mode, addRole: state.addRole });
  } catch (err) {
    clientLog(`savePrefs 失败: ${String(err?.message || err)}`);
  }
}

async function runOptimize() {
  if (state.running) return;
  const input = el("input");
  const text = (input?.value || "").trim();
  if (!text) {
    setStatus("先写一段提示词。", "error");
    input?.focus();
    return;
  }
  if (text.length > MAX_INPUT) {
    setStatus(`太长了（${text.length} 字），请压到 ${MAX_INPUT} 字以内。`, "error");
    return;
  }
  state.running = true;
  const btn = el("run");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "优化中…";
  }
  setStatus(`正在按「${currentMode().label}」重写…`);
  try {
    const res = await postJson("optimize", {
      text,
      mode: state.mode,
      addRole: state.addRole,
    });
    state.base = text;
    state.result = res?.result || "";
    state.resultMode = res?.mode || state.mode;
    state.compare = false;
    renderResult();
    setStatus(state.result ? "完成。复制走，或者自己再改。" : "模型没有返回内容，再试一次。");
    await loadHistory();
  } catch (err) {
    setStatus(`优化失败：${String(err?.message || err)}`, "error");
  } finally {
    state.running = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "优化";
    }
  }
}

/**
 * 三路兵分：宿主剪贴板 → 浏览器剪贴板 → 老式 execCommand。
 * 三层都失败才报错，并且每一层的真实原因都写进 Hana 日志 ——
 * iframe 里的报错外面看不见，不落日志就只能瓤。
 */
async function writeClipboard(text) {
  const failures = [];

  // 宿主那一路若没回包会把整个复制卡死，所以给它一个上限，到时往下走
  const withTimeout = (promise, ms) =>
    Promise.race([
      promise,
      new Promise((_, reject) => window.setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms)),
    ]);

  try {
    if (typeof hana?.clipboard?.writeText === "function") {
      await withTimeout(hana.clipboard.writeText(text), 2500);
      return { ok: true, via: "host" };
    }
    failures.push("host: hana.clipboard 不可用");
  } catch (err) {
    failures.push(`host: ${String(err?.code || err?.name || "error")} ${String(err?.message || err)}`);
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { ok: true, via: "navigator" };
    }
    failures.push("navigator: 接口不可用");
  } catch (err) {
    failures.push(`navigator: ${String(err?.name || "error")} ${String(err?.message || err)}`);
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const done = document.execCommand("copy");
    ta.remove();
    if (done) return { ok: true, via: "execCommand" };
    failures.push("execCommand: 返回 false");
  } catch (err) {
    failures.push(`execCommand: ${String(err?.name || "error")} ${String(err?.message || err)}`);
  }

  return { ok: false, failures };
}

async function copyResult() {
  if (!state.result) return;
  const res = await writeClipboard(state.result);
  if (res.ok) {
    clientLog(`copy ok via=${res.via} len=${state.result.length}`);
    const btn = el("copy");
    if (btn) {
      btn.textContent = "已复制 ✓";
      window.setTimeout(() => { btn.textContent = "复制"; }, 1600);
    }
    setStatus(`已复制到剪贴板（${res.via}）。`);
  } else {
    clientLog(`copy FAILED ${res.failures.join(" | ")}`);
    setStatus("复制失败：三层通道都被挡住，手动选中再复制吧。", "error");
  }
}

/* ── 迭代改进 ───────────────────────────────────────────── */

/**
 * 接着改：把当前结果当起点，只按一句要求動它。
 * 改完自动切到对比视图——用户下一件想做的事，就是看改了哪。
 */
async function runIterate() {
  if (state.running || !state.result) return;
  const input = el("iterateInput");
  const instruction = (input?.value || "").trim();
  if (!instruction) {
    setStatus("写一句你想怎么改。", "error");
    input?.focus();
    return;
  }
  state.running = true;
  const btn = el("iterateRun");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "改中…";
  }
  const before = state.result;
  setStatus("正在按你的要求改…");
  try {
    const res = await postJson("optimize", {
      text: before,
      mode: "iterate",
      addRole: state.addRole,
      instruction,
    });
    state.base = before;
    state.result = res?.result || "";
    state.resultMode = res?.mode || "iterate";
    state.compare = true;
    if (input) input.value = "";
    renderResult();
    setStatus(state.result ? "改完了，左右对着看。" : "模型没有返回内容，再试一次。");
    await loadHistory();
  } catch (err) {
    setStatus(`迭代失败：${String(err?.message || err)}`, "error");
  } finally {
    state.running = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "继续改";
    }
  }
}

/* ── 原文/结果对比 ──────────────────────────────────────── */

function diffCell(text, isEmpty) {
  const cell = document.createElement("div");
  cell.className = "ps-diff-cell";
  if (isEmpty) {
    cell.dataset.empty = "true";
    cell.textContent = "";
  } else {
    cell.textContent = text;
  }
  return cell;
}

function renderDiff() {
  const body = el("diffBody");
  if (!body) return;
  body.textContent = "";
  const frag = document.createDocumentFragment();
  for (const row of diffRows(state.base, state.result)) {
    const line = document.createElement("div");
    line.className = "ps-diff-row";
    line.dataset.type = row.type;
    line.appendChild(diffCell(row.left, row.left === null));
    line.appendChild(diffCell(row.right, row.right === null));
    frag.appendChild(line);
  }
  body.appendChild(frag);
}

/* ── 历史 ───────────────────────────────────────────────── */

function formatTime(ts) {
  const d = new Date(Number(ts) || 0);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function deleteHistoryItem(id) {
  try {
    await postJson("history/delete", { id });
    await loadHistory();
    setStatus("删掉了这一条。");
  } catch (err) {
    setStatus(`删除失败：${String(err?.message || err)}`, "error");
  }
}

async function clearHistory() {
  try {
    await postJson("history/clear", {});
    await loadHistory();
    setStatus("历史已清空。");
  } catch (err) {
    setStatus(`清空失败：${String(err?.message || err)}`, "error");
  }
}

async function loadHistory() {
  const box = el("history");
  if (!box) return;
  let items = [];
  try {
    const res = await apiFetch("history?limit=20");
    items = Array.isArray(res?.items) ? res.items : [];
  } catch (err) {
    clientLog(`loadHistory 失败: ${String(err?.message || err)}`);
  }
  box.textContent = "";
  const clearBtn = el("historyClear");
  if (clearBtn) clearBtn.hidden = !items.length;
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "ps-empty";
    empty.textContent = "还没有历史记录。";
    box.appendChild(empty);
    return;
  }
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "ps-history-item";
    const isIterate = item.kind === "iterate";
    row.title =
      isIterate && item.instruction
        ? `${item.input || ""}\n\n修改要求：${item.instruction}`
        : String(item.input || "");

    const text = document.createElement("span");
    text.className = "ps-history-text";
    const preview = String(item.input || "").replace(/\s+/g, " ").slice(0, 60);
    text.textContent = isIterate
      ? `[迭代改进] 「${String(item.instruction || "").slice(0, 24)}」→ ${preview}`
      : `[${modeLabelOf(item.mode)}] ${preview}`;

    const time = document.createElement("span");
    time.className = "ps-history-time";
    time.textContent = formatTime(item.at);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "ps-history-del";
    del.textContent = "×";
    del.title = "删掉这一条";
    del.setAttribute("aria-label", "删掉这一条历史");
    del.addEventListener("click", (event) => {
      event.stopPropagation();
      void deleteHistoryItem(item.id);
    });

    row.appendChild(text);
    row.appendChild(time);
    row.appendChild(del);
    row.addEventListener("click", () => {
      const input = el("input");
      if (input) {
        input.value = item.input || "";
        renderCounter();
      }
      state.base = item.input || "";
      state.result = item.output || "";
      state.resultMode = item.mode || state.mode;
      state.compare = false;
      state.mode = item.mode === "iterate" ? state.mode : item.mode || state.mode;
      state.addRole = item.addRole === true;
      const sw = el("addRole");
      if (sw) sw.checked = state.addRole;
      renderModes();
      renderResult();
      setStatus("已载入这条历史。");
    });
    box.appendChild(row);
  }
}

/* ── 启动 ───────────────────────────────────────────────── */

function build() {
  const root = el("root");
  if (!root) return;
  root.innerHTML = `
    <div class="ps-root">
      <div class="ps-modes" id="modes" role="tablist"></div>
      <div class="ps-hint" id="hint"></div>
      <div class="ps-editor">
        <textarea class="ps-textarea" id="input" spellcheck="false"
          placeholder="写下你的基础提示词。糙一点没关系，这里就是把它改利索的地方。"></textarea>
      </div>
      <div class="ps-actions">
        <label class="ps-switch"><input type="checkbox" id="addRole"> 附加角色设定</label>
        <span class="ps-count" id="count">0 / ${MAX_INPUT}</span>
        <button class="ps-btn ps-btn-primary" id="run" type="button">优化</button>
      </div>
      <div class="ps-result">
        <div class="ps-section-head">
          <span>优化结果</span>
          <span class="ps-tag" id="tag" hidden></span>
          <span class="ps-head-tools">
            <button class="ps-btn" id="compare" type="button" disabled>对比</button>
            <button class="ps-btn" id="copy" type="button" disabled>复制</button>
          </span>
        </div>
        <pre class="ps-out" id="out" data-empty="true"></pre>
        <div class="ps-diff" id="diff" hidden>
          <div class="ps-diff-head">
            <span>原文</span>
            <span>优化后</span>
          </div>
          <div class="ps-diff-body" id="diffBody"></div>
        </div>
        <div class="ps-iterate" id="iterateRow" hidden>
          <input class="ps-iterate-input" id="iterateInput" type="text" spellcheck="false"
            placeholder="想怎么改？比如：结尾再狠一点，加个具体数字" />
          <button class="ps-btn" id="iterateRun" type="button">继续改</button>
        </div>
      </div>
      <div class="ps-status" id="status"></div>
      <div class="ps-history-head">
        <span>历史</span>
        <button class="ps-link" id="historyClear" type="button" hidden>清空</button>
      </div>
      <div class="ps-history" id="history"></div>
    </div>`;

  el("input").addEventListener("input", renderCounter);
  el("addRole").addEventListener("change", (event) => {
    state.addRole = event.target.checked;
    void savePrefs();
  });
  el("run").addEventListener("click", () => void runOptimize());
  el("copy").addEventListener("click", () => void copyResult());
  el("historyClear").addEventListener("click", () => void clearHistory());
  el("compare").addEventListener("click", () => {
    state.compare = !state.compare;
    renderResult();
  });
  el("iterateRun").addEventListener("click", () => void runIterate());
  el("iterateInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void runIterate();
    }
  });
  el("input").addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void runOptimize();
    }
  });

  renderModes();
  renderResult();
  renderCounter();
}

async function main() {
  build();
  // 一行环境诊断：复制出问题时，日志里能直接看出是哪一层断的
  clientLog(
    `env: hana=${typeof hana?.clipboard?.writeText === "function" ? "clipboard" : "no-clipboard"}` +
      ` navigator=${navigator.clipboard?.writeText ? "yes" : "no"}` +
      ` secure=${window.isSecureContext ? "yes" : "no"} focus=${document.hasFocus() ? "yes" : "no"}`,
  );
  await loadMeta();
  await loadHistory();
  try {
    await hana.ready();
  } catch (err) {
    clientLog(`hana.ready 失败: ${String(err?.message || err)}`);
  }
  setStatus("写一段，选一档，Ctrl/⌘ + Enter 直接优化。");
}

void main();
