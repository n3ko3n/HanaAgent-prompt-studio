// assets/panel-shell.js — 输入框上方面板的外壳
//
// 只干三件事：收起 / 展开、关闭、以及把诊断写进 Hana 日志。
// 面板内容（档位、输入、结果、历史）全部由 studio.js 提供，和卡片用的是同一份代码。
import { hana } from "./sdk.js";
import { appHeaders, apiUrl, clientLog } from "./app-api.js";

const COLLAPSED_H = 40;
const EXPANDED_H = 460;

const root = document.getElementById("psp");
let bound = null;
let isExpanded = false;

function applyExpanded(expanded) {
  isExpanded = Boolean(expanded);
  if (root) root.dataset.expanded = isExpanded ? "true" : "false";
}

async function setExpanded(expanded) {
  applyExpanded(expanded); // 先动，等宿主回包前界面不卡
  if (!bound) {
    clientLog("setPresentation 未发送：宿主还没下发面板上下文");
    return;
  }
  try {
    await hana.inputPanel.setPresentation({
      expanded,
      height: EXPANDED_H,
      collapsedHeight: COLLAPSED_H,
    });
  } catch (err) {
    clientLog(`setPresentation 失败: ${String(err?.message || err)}`);
  }
}

/** 关闭面板：页面自己摘不掉面板，转交应用后端走 userInteraction.dismiss */
async function closePanel() {
  const sessionId = typeof bound?.sessionId === "string" ? bound.sessionId : "";
  clientLog(`closePanel sessionId=${sessionId ? "yes" : "no"}`);
  if (!sessionId) return;
  try {
    await fetch(apiUrl("close-panel"), {
      method: "POST",
      headers: appHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ sessionId }),
    });
  } catch (err) {
    clientLog(`closePanel 失败: ${String(err?.message || err)}`);
  }
}

const bar = document.getElementById("psp-bar");
const toggle = document.getElementById("psp-toggle");
const close = document.getElementById("psp-close");

if (bar) {
  bar.addEventListener("click", () => void setExpanded(!isExpanded));
  bar.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void setExpanded(!isExpanded);
    }
  });
}
if (toggle) {
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    void setExpanded(!isExpanded);
  });
}
if (close) {
  close.addEventListener("click", (event) => {
    event.stopPropagation();
    void closePanel();
  });
}

// 宿主是 presentation 的唯一事实源：它说收起就收起
hana.inputPanel.onContextChanged((context) => {
  bound = context;
  clientLog(
    `context: panel=${context?.panelId} expanded=${context?.presentation?.expanded} ` +
      `h=${context?.presentation?.height} ch=${context?.presentation?.collapsedHeight}`,
  );
  applyExpanded(Boolean(context?.presentation?.expanded));
});

applyExpanded(false);
