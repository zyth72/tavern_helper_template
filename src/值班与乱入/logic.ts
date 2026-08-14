import { 内置舰娘名单 } from './ship_list';
import type { Settings } from './settings';

/** 时段类型 */
export type ShiftPeriod = '安息日' | '夜间' | '白昼' | '空档';

/** 夜间开始 22:00 */
const 夜间开始 = 22 * 60;
/** 白昼结束 18:00, 之后为空档 */
const 白昼结束 = 18 * 60;

/** 解析 HH:mm 为分钟数 */
function parseTime(hhmm: string): number {
  const [hour, minute] = hhmm.split(':').map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

/** 世界书条目名: 记录当前夜班持有者 (启用, 注入 AI 提示词) */
const 夜班持有者条目名 = '夜班持有者';
/** 世界书条目名: 记录历史选过的夜班舰娘 (禁用, 仅脚本读取, 不注入 AI) */
const 夜班历史条目名 = '夜班历史';
/** 历史记录条数上限, 超过则整体清空重新累计 */
const 历史上限 = 350;

/**
 * 获取当前角色卡的主世界书名称.
 * 本脚本为深度定制内容, 只为一张角色卡服务, 主世界书必然存在.
 */
function getCharWorldbookName(): string | null {
  return getCharWorldbookNames('current').primary;
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

/** 内存缓存: 避免生成前回调中异步读世界书导致错过提示词合并时机 (世界书条目的镜像) */
let 夜班持有者缓存: { 夜班日: string; 名字: string } | null = null;
let 夜班历史缓存: string[] = [];

/**
 * 确定夜班持有者 (同步, 供生成前注入使用).
 * - 仅夜间时段需要; 其余时段 (白昼/空档/安息日) 删除"夜班持有者"条目, 夜班结束.
 * - 当晚已定 (缓存或世界书) 则沿用; 否则从名单随机选择, 排除历史选过的名字,
 *   并异步持久化到当前角色卡主世界书的"夜班持有者"条目与"夜班历史"条目.
 */
export function determineNightHolder(storyTime: Date, settings: Settings): string | null {
  const period = getShiftPeriod(storyTime, settings);
  if (period !== '夜间') {
    // 非夜间 (夜班结束时刻后/安息日): 夜班已结束, 删除持有者条目, 次日夜间再重新选择
    void 清除夜班持有者条目();
    return null;
  }
  const 夜班日 = getNightShiftDate(storyTime, settings);
  if (夜班持有者缓存?.夜班日 === 夜班日) {
    console.info(`[值班与乱入] 夜班持有者沿用: ${夜班持有者缓存.名字} (夜班日 ${夜班日})`);
    return 夜班持有者缓存.名字;
  }
  const 名单 = getActiveShipList(settings);
  let 可用 = 名单.filter(name => !夜班历史缓存.includes(name));
  if (可用.length === 0) {
    console.info('[值班与乱入] 名单中的舰娘已全部选过, 清空历史重新随机');
    夜班历史缓存 = [];
    可用 = 名单;
  }
  const 名字 = 可用[Math.floor(Math.random() * 可用.length)];
  if (!名字) {
    console.warn('[值班与乱入] 夜班持有者选择失败: 名单为空');
    return null;
  }
  夜班持有者缓存 = { 夜班日, 名字 };
  夜班历史缓存.push(名字);
  if (夜班历史缓存.length > 历史上限) {
    console.info(`[值班与乱入] 历史记录超过 ${历史上限} 条, 已清空`);
    夜班历史缓存 = [];
  }
  console.info(`[值班与乱入] 夜班持有者确定: ${名字} (随机选择), 夜班日 ${夜班日}, 正在写入世界书...`);
  void 持久化夜班持有者(夜班日, 名字);
  void 持久化夜班历史(夜班历史缓存);
  return 名字;
}

/** 启动时从当前角色卡主世界书恢复缓存: 夜班持有者 + 夜班历史 (仅读取, 不创建世界书) */
export async function restoreNightHolderCache(): Promise<void> {
  try {
    const worldbook_name = getCharWorldbookName();
    if (!worldbook_name) {
      console.info('[值班与乱入] 当前角色卡未绑定主世界书, 跳过夜班缓存恢复');
      return;
    }
    const entries = await getWorldbook(worldbook_name);
    const holder_entry = entries.find(entry => entry.name === 夜班持有者条目名);
    const 日期 = holder_entry?.content.match(/日期：(\d{4}-\d{2}-\d{2})/)?.[1];
    const 名字 = holder_entry?.content.match(/夜班持有者：(.+)/)?.[1];
    if (日期 && 名字) {
      夜班持有者缓存 = { 夜班日: 日期, 名字 };
      console.info(`[值班与乱入] 已从世界书恢复夜班持有者: ${名字} (夜班日 ${日期})`);
    } else {
      console.info('[值班与乱入] 世界书暂无夜班持有者条目, 将在夜间时段确定');
    }
    const history_entry = entries.find(entry => entry.name === 夜班历史条目名);
    if (history_entry) {
      夜班历史缓存 = history_entry.content
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      console.info(`[值班与乱入] 已从世界书恢复夜班历史 (${夜班历史缓存.length} 条)`);
    }
  } catch {
    // 没有聊天文件时忽略, 生成时再处理
  }
}

/** 清空夜班缓存 (聊天文件切换时调用) */
export function resetNightHolderCache(): void {
  夜班持有者缓存 = null;
  夜班历史缓存 = [];
}

/** 非夜间时段: 删除当前角色卡主世界书中的"夜班持有者"条目 (夜班已结束, 次日夜间重新确定) */
async function 清除夜班持有者条目(): Promise<void> {
  夜班持有者缓存 = null; // 立即清缓存, 避免重复触发删除
  try {
    const worldbook_name = getCharWorldbookName();
    if (!worldbook_name) {
      return;
    }
    await deleteWorldbookEntries(worldbook_name, entry => entry.name === 夜班持有者条目名);
    console.info('[值班与乱入] 非夜间时段, 已删除夜班持有者条目 (次日夜间重新确定)');
  } catch (error) {
    console.warn('[值班与乱入] 删除夜班持有者条目失败', error);
  }
}

/**
 * 将夜班持有者写入当前角色卡主世界书的"夜班持有者"条目 (不存在则创建).
 *
 * 条目内容使用固定格式, 脚本与酒馆均可直接读取:
 * ```
 * 日期：YYYY-MM-DD
 * 夜班持有者：名字
 * ```
 * - `日期` 为夜班日 (跨午夜归属前一天的夜间时段)
 * - 解析见 `restoreNightHolderCache` 中的正则
 */
async function 持久化夜班持有者(夜班日: string, 名字: string): Promise<void> {
  try {
    // 只写入当前角色卡已绑定的主世界书, 不创建新世界书
    const worldbook_name = getCharWorldbookName();
    if (!worldbook_name) {
      console.warn('[值班与乱入] 当前角色卡未绑定主世界书, 跳过夜班持有者条目写入');
      return;
    }
    const content = `日期：${夜班日}\n夜班持有者：${名字}`;
    const entries = await getWorldbook(worldbook_name);
    if (entries.some(entry => entry.name === 夜班持有者条目名)) {
      await updateWorldbookWith(
        worldbook_name,
        worldbook => worldbook.map(entry => (entry.name === 夜班持有者条目名 ? { ...entry, content } : entry)),
      );
    } else {
      await createWorldbookEntries(worldbook_name, [
        {
          name: 夜班持有者条目名,
          content,
          enabled: true,
          strategy: { type: 'constant' },
          position: { type: 'after_character_definition', order: 100 },
        },
      ]);
    }
    console.info(`[值班与乱入] 夜班持有者条目已写入世界书 '${worldbook_name}': ${content.replace(/\n/g, ' | ')}`);
  } catch (error) {
    console.warn('[值班与乱入] 写入夜班持有者条目失败', error);
  }
}

/**
 * 将历史选过的夜班舰娘写入当前角色卡主世界书的"夜班历史"条目 (不存在则创建).
 *
 * - 条目为禁用状态 (enabled: false), 不会注入 AI 提示词, 仅供脚本读取;
 * - 内容为每行一个名字;
 * - 条数超过 `历史上限` 时已由 `determineNightHolder` 清空, 此处写入清空后的内容.
 */
async function 持久化夜班历史(历史: string[]): Promise<void> {
  try {
    const worldbook_name = getCharWorldbookName();
    if (!worldbook_name) {
      return;
    }
    const content = 历史.join('\n');
    const entries = await getWorldbook(worldbook_name);
    if (entries.some(entry => entry.name === 夜班历史条目名)) {
      await updateWorldbookWith(
        worldbook_name,
        worldbook => worldbook.map(entry => (entry.name === 夜班历史条目名 ? { ...entry, content } : entry)),
      );
    } else {
      await createWorldbookEntries(worldbook_name, [
        {
          name: 夜班历史条目名,
          content,
          enabled: false,
          strategy: { type: 'constant' },
          position: { type: 'after_character_definition', order: 100 },
        },
      ]);
    }
    console.info(`[值班与乱入] 夜班历史条目已写入世界书 '${worldbook_name}' (${历史.length} 条)`);
  } catch (error) {
    console.warn('[值班与乱入] 写入夜班历史条目失败', error);
  }
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
