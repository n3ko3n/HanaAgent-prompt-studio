// assets/diff.js — 行级差异对比
//
// 纯函数，不碰 DOM，所以可以在 Hana 外面直接跑测试（见 tests/diff.test.mjs）。
// 输出的是"对齐好的行"而不是两份流水账：左边删的那行和右边新增的那行会配成同一行，
// 这样并排看的时候，改动落在同一个高度上，一眼能对上。

export const DIFF_CELL_BUDGET = 400000;

export function splitLines(text) {
  return String(text ?? "").split("\n");
}

/**
 * 行级差异，返回 [{ type: "same" | "del" | "add" | "change", left, right }]。
 * left 是原文那一栏，right 是改后那一栏；配不上对的一侧为 null（界面上留空但占位）。
 */
export function diffRows(leftText, rightText) {
  const a = splitLines(leftText);
  const b = splitLines(rightText);
  // LCS 是 O(n·m)，行数太多会卡住界面，超预算就退化成逐行直排
  if (a.length * b.length > DIFF_CELL_BUDGET) {
    const rows = [];
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      const l = i < a.length ? a[i] : null;
      const r = i < b.length ? b[i] : null;
      rows.push({ type: l === r ? "same" : "change", left: l, right: r });
    }
    return rows;
  }
  return pairRows(lcsRows(a, b));
}

/** 经典 LCS 回溯，产出逐行的增 / 删 / 同 */
export function lcsRows(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const rows = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: "same", left: a[i], right: b[j] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: "del", left: a[i], right: null });
      i++;
    } else {
      rows.push({ type: "add", left: null, right: b[j] });
      j++;
    }
  }
  while (i < n) rows.push({ type: "del", left: a[i++], right: null });
  while (j < m) rows.push({ type: "add", left: null, right: b[j++] });
  return rows;
}

/** 把相邻的删块和增块按顺序配成同一行 */
export function pairRows(rows) {
  const out = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].type === "same") {
      out.push(rows[i]);
      i++;
      continue;
    }
    const dels = [];
    const adds = [];
    while (i < rows.length && rows[i].type !== "same") {
      if (rows[i].type === "del") dels.push(rows[i].left);
      else adds.push(rows[i].right);
      i++;
    }
    const max = Math.max(dels.length, adds.length);
    for (let k = 0; k < max; k++) {
      const l = k < dels.length ? dels[k] : null;
      const r = k < adds.length ? adds[k] : null;
      out.push({
        type: l !== null && r !== null ? "change" : l !== null ? "del" : "add",
        left: l,
        right: r,
      });
    }
  }
  return out;
}
