import { 内置舰娘名单 } from './ship_list';
import type { Settings } from './settings';

/** 时段类型 */
export type ShiftPeriod = '安息日' | '夜间' | '白昼' | '空档';

/** 夜间开始 22:00 */
const 夜间开始 = 22 * 60;
/** 白昼结束 18:00, 之后为空档 */
const 白昼结束 = 18 * 60;
/** 历史记录条数上限, 超过则整体清空重新累计 */
const 历史上限 = 350;

/** chat 变量 key: 当前夜班持有者 (存 { 夜班日, 名字 }) */
const 夜班持有者变量key = '夜班持有者';
/** chat 变量 key: 历史选过的夜班舰娘 (存 string[]) */
const 夜班历史变量key = '夜班历史';

/** 解析 HH:mm 为分钟数 */
function parseTime(hhmm: string): number {
  const [hour, minute] = hhmm.split(':').map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const 星期 = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
  return `${formatDate(date)}（周${星期}）${hh}:${mm}`;
}

/** 剧情时间: 与现实时间完全同步, 仅日期相差 +7 天 */
export function getStoryTime(): Date {
  const now = new Date();
  now.setDate(now.getDate() + 7);
  return now;
}

/**
 * 判断当前剧情时刻所处的时段:
 * - 安息日: 周日 00:00-24:00 (优先级最高)
 * - 夜间: 22:00 - 次日"夜班结束时刻" (设置项, 默认 06:00)
 * - 白昼: 夜班结束时刻 - 18:00
 * - 空档: 18:00 - 22:00
 */
export function getShiftPeriod(storyTime: Date, settings: Settings): ShiftPeriod {
  if (storyTime.getDay() === 0) {
    return '安息日';
  }
  const minutes = storyTime.getHours() * 60 + storyTime.getMinutes();
  const 夜班结束 = parseTime(settings.夜班结束时刻);
  if (minutes >= 夜间开始 || minutes < 夜班结束) {
    return '夜间';
  }
  if (minutes < 白昼结束) {
    return '白昼';
  }
  return '空档';
}

/**
 * 夜班日: 夜间时段 (22:00 - 次日"夜班结束时刻") 跨午夜, 属于同一晚.
 * 当前时刻 < 夜班结束时刻 (凌晨) 时, 夜班日属于前一天.
 */
export function getNightShiftDate(storyTime: Date, settings: Settings): string {
  const date = new Date(storyTime);
  if (date.getHours() * 60 + date.getMinutes() < parseTime(settings.夜班结束时刻)) {
    date.setDate(date.getDate() - 1);
  }
  return formatDate(date);
}

/** 有效舰娘名单: 优先使用自定义名单, 否则使用内置完整名单 */
export function getActiveShipList(settings: Settings): string[] {
  return settings.自定义舰娘名单.length > 0 ? settings.自定义舰娘名单 : 内置舰娘名单;
}

/** 从名单中随机取 n 个不重复的名字 */
export function pickRandomShips(list: string[], n: number): string[] {
  const pool = [...list];
  const result: string[] = [];
  while (result.length < n && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(index, 1)[0]);
  }
  return result;
}

/** 从 chat 变量读取夜班历史 (同步; 非法内容按空处理) */
function 读夜班历史(): string[] {
  const value = getVariables({ type: 'chat' })[夜班历史变量key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** 读取当前夜班持有者 (同步; 仅用于注入, 判断同样以该 chat 变量为准) */
export function getLatestNightHolder(): { 夜班日: string; 名字: string } | null {
  const value = getVariables({ type: 'chat' })[夜班持有者变量key];
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { 夜班日, 名字 } = value as { 夜班日?: unknown; 名字?: unknown };
  return typeof 夜班日 === 'string' && typeof 名字 === 'string' ? { 夜班日, 名字 } : null;
}

/**
 * 确定夜班持有者 (同步, 以 chat 变量为准).
 * - 仅夜间时段需要; 其余时段 (白昼/空档/安息日) 清空持有者变量, 夜班结束.
 * - 已有持有者且夜班日匹配则沿用; 否则从名单随机选择 (排除历史), 并写入 chat 变量.
 */
export function determineNightHolder(storyTime: Date, settings: Settings): string | null {
  const period = getShiftPeriod(storyTime, settings);
  if (period !== '夜间') {
    deleteVariable(夜班持有者变量key, { type: 'chat' });
    return null;
  }
  const 夜班日 = getNightShiftDate(storyTime, settings);
  const 现有 = getLatestNightHolder();
  if (现有 && 现有.夜班日 === 夜班日) {
    console.info(`[值班与乱入] 夜班持有者沿用: ${现有.名字} (夜班日 ${夜班日})`);
    return 现有.名字;
  }
  let 历史 = 读夜班历史();
  const 名单 = getActiveShipList(settings);
  let 可用 = 名单.filter(name => !历史.includes(name));
  if (可用.length === 0) {
    console.info('[值班与乱入] 名单中的舰娘已全部选过, 清空历史重新随机');
    历史 = [];
    可用 = 名单;
  }
  const 名字 = 可用[Math.floor(Math.random() * 可用.length)];
  if (!名字) {
    console.warn('[值班与乱入] 夜班持有者选择失败: 名单为空');
    return null;
  }
  历史.push(名字);
  if (历史.length > 历史上限) {
    console.info(`[值班与乱入] 历史记录超过 ${历史上限} 条, 已清空`);
    历史 = [];
  }
  insertOrAssignVariables({ [夜班持有者变量key]: { 夜班日, 名字 } }, { type: 'chat' });
  insertOrAssignVariables({ [夜班历史变量key]: 历史 }, { type: 'chat' });
  console.info(`[值班与乱入] 夜班持有者确定: ${名字} (随机选择), 夜班日 ${夜班日}`);
  return 名字;
}

/** 注册 chat 变量结构, 便于变量管理器查看/多设备核对 */
export function registerNightHolderSchema(): void {
  registerVariableSchema(
    z.object({
      [夜班持有者变量key]: z
        .object({
          夜班日: z.string(),
          名字: z.string(),
        })
        .optional(),
      [夜班历史变量key]: z.array(z.string()).optional(),
    }),
    { type: 'chat' },
  );
}

/** 乱入检定写入酒馆变量的结构化数据 */
export type IntrusionVariable = {
  roll: number | null;
  命中: boolean | null;
  候选舰娘: string[];
  时段: ShiftPeriod;
  时间: string;
  豁免: string | null;
  阈值: number;
};

/** 乱入检定结果: 注入文本 + 写入酒馆变量的结构化数据 */
export type IntrusionCheckResult = {
  文本: string;
  变量: IntrusionVariable;
};

/** 根据酒馆变量中的检定结果构造文本 (供预设宏读取时使用) */
export function formatIntrusionResult(v: IntrusionVariable): string {
  if (v.豁免 === '安息日') {
    return '【乱入检定】豁免：今日为安息日，不执行乱入检定。';
  }
  if (v.豁免 === '夜间私密场景') {
    return '【乱入检定】豁免：夜间私密场景（22:00 后），不执行乱入检定。';
  }
  if (v.命中) {
    // 命中: 只注入候选舰娘 XML 块, 不附带说明文字
    return `<乱入舰娘>\n${v.候选舰娘.join('\n')}\n</乱入舰娘>`;
  }
  return `【乱入检定】roll: ${v.roll}（<${v.阈值}）→ 无人乱入。本场仅限当前在场角色，禁止额外添加舰娘。`;
}

/**
 * 执行乱入检定. 受值班限制:
 * - 夜间私密场景 (22:00 后): 仅夜班持有者与凛在场, 豁免不检定
 * - 安息日 (周日): 凛独处, 豁免不检定
 * 其余时段 (白昼/空档): 命中 (roll ≥ 阈值) 注入 3 名候选舰娘, 由模型自行挑选并安排出场; 不命中注入"无人乱入".
 */
export function runIntrusionCheck(storyTime: Date, period: ShiftPeriod, settings: Settings): IntrusionCheckResult {
  const 时间 = formatDateTime(storyTime);
  if (period === '安息日') {
    const 变量: IntrusionVariable = {
      roll: null,
      命中: null,
      候选舰娘: [],
      时段: period,
      时间,
      豁免: '安息日',
      阈值: settings.乱入检定阈值,
    };
    return { 文本: formatIntrusionResult(变量), 变量 };
  }
  if (period === '夜间') {
    const 变量: IntrusionVariable = {
      roll: null,
      命中: null,
      候选舰娘: [],
      时段: period,
      时间,
      豁免: '夜间私密场景',
      阈值: settings.乱入检定阈值,
    };
    return { 文本: formatIntrusionResult(变量), 变量 };
  }
  const roll = Math.floor(Math.random() * 100) + 1;
  if (roll >= settings.乱入检定阈值) {
    const 候选 = pickRandomShips(getActiveShipList(settings), 3);
    const 变量: IntrusionVariable = {
      roll,
      命中: true,
      候选舰娘: 候选,
      时段: period,
      时间,
      豁免: null,
      阈值: settings.乱入检定阈值,
    };
    return { 文本: formatIntrusionResult(变量), 变量 };
  }
  const 变量: IntrusionVariable = {
    roll,
    命中: false,
    候选舰娘: [],
    时段: period,
    时间,
    豁免: null,
    阈值: settings.乱入检定阈值,
  };
  return { 文本: formatIntrusionResult(变量), 变量 };
}
