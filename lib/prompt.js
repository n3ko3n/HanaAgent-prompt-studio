// lib/prompt.js — 三档优化模板、迭代模板与文本工具
//
// 三档模板（基础优化 / 专业优化 / 步骤化规划）与迭代模板均为本应用自研，
// 不派生自任何开源项目的模板文本；三档之间只保留一条通用约束——
// 变量占位符 {{...}} 原样保留、不改写。
// 许可与来源说明见仓库根目录 NOTICE.md。

export const MAX_INPUT_CHARS = 8000;
export const DEFAULT_MAX_TOKENS = 2400;
export const DEFAULT_TEMPERATURE = 0.4;

/** 三档的对外描述。id 是稳定契约，label 只用于界面展示。 */
export const MODES = [
  {
    id: "basic",
    label: "基础优化",
    hint: "消除模糊表达、补齐关键信息，改动最小、不引入结构模板",
  },
  {
    id: "professional",
    label: "专业优化",
    hint: "把泛泛而谈变成精准具体的要求，加量化标准与明确边界",
  },
  {
    id: "planning",
    label: "步骤化规划",
    hint: "拆成角色、背景、关键步骤与输出要求的完整提示词结构",
  },
];

export const MODE_IDS = new Set(MODES.map((mode) => mode.id));

/**
 * 迭代改进：不算第四档，而是“拿现成的一份提示词接着改”。
 * 它和前三个档位的输入不同（当前提示词 + 修改要求），所以单独一套模板。
 */
export const ITERATE_MODE_ID = "iterate";
export const ITERATE_LABEL = "迭代改进";

/** 任何非法档位一律退回基础优化，绝不因为一个字段丢掉整次调用 */
export function normalizeMode(value) {
  return MODE_IDS.has(value) ? value : "basic";
}

/** 变量占位符规则：{{...}} 是运行时填空位，改写时原样保留 */
const VARIABLE_RULE =
  "原文里凡是 {{...}} 形状的记号，都当作不可改写的标签：它是用户留给运行阶段填的空位，" +
  "与你这次的改写无关。请把这些标签原样搬到结果里，外形一字不动。";

/** 「附加角色设定」开关打开时追加的一段要求；默认关闭 */
const ADD_ROLE_RULE = [
  "附加要求：请在优化后的提示词开头补一段明确的角色定义（例如「你是一位……」），",
  "说明执行者的身份与专长，让人一眼知道该由谁来做这件事。",
].join("\n");

const BASIC_SYSTEM = `你是提示词的轻量整修助手。

用户会递来一段自己写的提示词。你要做的是小幅整修，让它更好懂、更好落地——不是重写，也不是加料。整修时守住三条：

一、只调说法，不动诉求。
用户想做什么、要什么，原样保留；你没被提到的目标不要替他补，边界也不要替他放宽或收窄。

二、既然叫基础档，就别加装饰。
不添角色、不设标题、不分点、不套结构样式，越贴近原文越好。要动的只有含糊处：「写好看点」「再详细些」这类落不到地的说法，替它定出能核对的标准——大概多长、什么口吻、哪些必须有、哪些别出现。原文紧凑就别抻长，篇幅跟着信息量走。

三、其余照旧。
原文用什么语言，结果就用什么语言。

${VARIABLE_RULE}

整修完，只交出那一段提示词，前后不加解释、总结或客套，也不要裹代码块。`;

const PROFESSIONAL_SYSTEM = `你是提示词的精准化编辑。

用户给你一段笼统、指向不清的提示词。你要把它钉到具体，让每项要求都能被判断「做到没有」——而不是把任务本身换掉。分寸有三：

一、换虚为实。
「相关」「合适」「高质量」这类没抓手的词，换成能测量的描述：任务覆盖到哪里、不覆盖哪里，输入端给什么、输出端要什么、到什么标准算合格。原话里含糊的力度、篇幅、格式、口吻、条数，尽量落成可核对的量或明确区间。

二、精准不等于唯一。
用户原本的目标保持不变；别把要求收紧到只剩一种做法，留出合理腾挪。用户给的领域信息照用，不替他改写；拿不准的用中性说法带过，不凭空补事实、补数字。

三、语言和立场都不动。
结果仍用原文语言；你交出去的是一段更好用的提示词，不是替用户把那件事做掉。

${VARIABLE_RULE}

只给提示词本身，不要再附别的说明或举例，也不要反问用户。`;

const PLANNING_SYSTEM = `你是把粗略需求整理成结构化提示词的设计者。

用户会给你一段对某件事的说明。你要据此写出一份新的、条理清楚、别人能直接照着做的提示词。

这份提示词要能让接手的人不必回头再问。要做到这一点，通常得让他一眼看清三样东西——他是什么身份、手上已有什么、受什么约束；事情一步步怎么走、每步做到哪里算这步完成；最后交出什么、什么样才算合格。但「看清三样东西」不等于「排成三个标题」：怎么分节、标题怎么起、先说什么后说什么，都按任务本身定，别去套任何固定的编号模板。

同时守住几条底线：
· 你产出的是「一份提示词」，不是去执行那件事，也不是回答用户。
· 内容只围绕用户给的需求，不添他没提的目标；他给的信息不足以填补的地方，留白也好过编。
· 简明为上，该短就短，不为了显得「结构化」而堆砌。

${VARIABLE_RULE}

直接交付那份提示词。任何开场或收尾都算多余，诸如「下面是我帮你优化好的提示词」这类话一句都不要。`;

const SYSTEM_BY_MODE = {
  basic: BASIC_SYSTEM,
  professional: PROFESSIONAL_SYSTEM,
  planning: PLANNING_SYSTEM,
};

/* ── 迭代改进 ────────────────────────────────────────────
   这一档的难点不是“改得更好”，而是“只改要改的地方”、
   所以规则里最重的两条是“其余原样”和“不许顺手优化”。 */
const ITERATE_SYSTEM = `你是提示词迭代编辑器。

用户会给你两份东西：一份已经成型、大体可用的【当前提示词】，和一条具体的【修改要求】。
你的任务：严格按这条要求改动，产出下一版提示词。

规则：
1. 只改修改要求里点到的地方，其余内容尽量原样保留——包括原有结构、段落顺序、措辞习惯、专有名词和格式约定。
2. 不要顺手“优化”没被要求的部分，不要重写全文，不要新增章节。
3. 改动要看得见：宁可把这条要求落实得具体一点，也不要用无关的润色把差异淹没。
4. 当前提示词里的 {{变量占位符}} 必须原样保留，不要改名、删除或替换成具体值。
5. 如果修改要求与当前提示词冲突，以修改要求为准，同时让整份提示词保持自洽。
6. 结果必须仍然是一份完整、可以直接拿去用的提示词，不是片段，也不是修改建议。
7. 保持原提示词使用的语言。

输出要求：只输出改后的完整提示词本身。不要解释你改了什么，不要前言、总结或代码块——
用户会自己用对比视图看差异，你多写的每一个字都是噪声。`;

export function buildIterateSystemPrompt({ addRole = false } = {}) {
  return addRole ? `${ITERATE_SYSTEM}\n\n${ADD_ROLE_RULE}` : ITERATE_SYSTEM;
}

export function buildIterateUserMessage({ current, instruction }) {
  return `【当前提示词】\n${current}\n\n【修改要求】\n${instruction}`;
}

/** 装配某一档的 system prompt；addRole 只在基础/专业两档有意义（规划档本就含角色段） */
export function buildSystemPrompt(mode, { addRole = false } = {}) {
  const resolved = normalizeMode(mode);
  let prompt = SYSTEM_BY_MODE[resolved];
  if (addRole && resolved !== "planning") {
    prompt += `\n\n${ADD_ROLE_RULE}`;
  }
  return prompt;
}

export function buildUserMessage(text) {
  return `【基础提示词】\n${text}`;
}

export function modeLabel(mode) {
  if (mode === ITERATE_MODE_ID) return ITERATE_LABEL;
  const hit = MODES.find((item) => item.id === normalizeMode(mode));
  return hit ? hit.label : MODES[0].label;
}

export function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** 去掉模型偶尔套上的代码围栏与常见前缀 */
export function stripWrapping(raw) {
  let out = String(raw ?? "").trim();
  const fence = out.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```$/);
  if (fence) out = fence[1].trim();
  out = out.replace(
    /^(优化后的?提示词|精准化后的?提示词|新提示词|改后的?提示词|迭代后的?提示词|optimized prompt|revised prompt)\s*[:：]\s*/i,
    "",
  );
  return out.trim();
}
