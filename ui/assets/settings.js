// assets/settings.js — 提示词工坊设置页
import { apiFetch, clientLog, postJson } from "./app-api.js";

const root = document.getElementById("root");

const state = {
  addRole: false,
  version: "0.0.0",
  historyTotal: 0,
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render() {
  root.textContent = "";

  root.appendChild(el("h1", "st-h1", "提示词工坊"));
  root.appendChild(el("p", "st-sub", `v${state.version} · 三档提示词优化`));

  // ── 角色设定 ────────────────────────────────────────────
  const roleCard = el("section", "st-card");
  roleCard.appendChild(el("div", "st-label", "附加角色设定"));
  roleCard.appendChild(
    el(
      "div",
      "st-desc",
      "打开后，每次优化都会在结果开头补一段「你是一位……」的身份定义。" +
        "默认关闭 —— 角色段会跟着提示词进入对话上下文，连续对话里容易反复重置身份。" +
        "「步骤化规划」档本身就含角色段落，不受这个开关影响。",
    ),
  );
  const roleRow = el("label", "st-row");
  const roleBox = document.createElement("input");
  roleBox.type = "checkbox";
  roleBox.checked = state.addRole;
  roleBox.addEventListener("change", () => {
    state.addRole = roleBox.checked;
    void save({ addRole: state.addRole });
  });
  roleRow.appendChild(roleBox);
  roleRow.appendChild(document.createTextNode("在基础 / 专业两档的结果开头附加角色定义"));
  roleCard.appendChild(roleRow);
  root.appendChild(roleCard);

  // ── 历史记录 ────────────────────────────────────────────
  const historyCard = el("section", "st-card");
  historyCard.appendChild(el("div", "st-label", "历史记录"));
  historyCard.appendChild(
    el(
      "div",
      "st-desc",
      `当前保存 ${state.historyTotal} 条（最多 50 条，同一段输入只留最新一次）。` +
        "历史只存在本机应用数据目录里，不会进入对话上下文。",
    ),
  );
  const actions = el("div", "st-actions");
  const clearBtn = el("button", "ps-btn", "清空历史");
  clearBtn.type = "button";
  clearBtn.addEventListener("click", () => void clearHistory());
  actions.appendChild(clearBtn);
  historyCard.appendChild(actions);
  root.appendChild(historyCard);

  // ── 关于 ────────────────────────────────────────────────
  const aboutCard = el("section", "st-card");
  aboutCard.appendChild(el("div", "st-label", "关于"));
  const meta = el("div", "st-meta");
  meta.innerHTML =
    "三档提示词模板为本应用自研，代码与模板文本以 MIT 发布。<br>" +
    "致谢开源项目 <code>youyongdemao/prompt-optimizer</code>（MIT）：本应用的骨架以它为起点。<br>" +
    "模型调用走 Hana 当前配置的辅助模型，本应用不接触任何供应商凭证或端点。<br>" +
    "优化结果默认只存在本应用里，只有你复制走、或让助手调用工具时才会进入对话。";
  aboutCard.appendChild(meta);
  root.appendChild(aboutCard);
}

async function save(patch) {
  try {
    const res = await postJson("prefs", patch);
    if (res?.prefs) {
      state.addRole = res.prefs.addRole;
    }
  } catch (err) {
    clientLog(`save 失败: ${String(err?.message || err)}`);
  }
}

async function clearHistory() {
  try {
    await postJson("history/clear", {});
    state.historyTotal = 0;
    render();
  } catch (err) {
    clientLog(`清空历史失败: ${String(err?.message || err)}`);
  }
}

async function main() {
  try {
    const meta = await apiFetch("meta");
    if (meta?.prefs) {
      state.addRole = meta.prefs.addRole === true;
    }
    state.version = meta?.version || state.version;
  } catch (err) {
    clientLog(`设置页 loadMeta 失败: ${String(err?.message || err)}`);
  }
  try {
    const history = await apiFetch("history?limit=1");
    state.historyTotal = Number(history?.total) || 0;
  } catch {
    state.historyTotal = 0;
  }
  render();
}

void main();
