import { 内置舰娘名单 } from './ship_list';
import type { Settings } from './settings';

/** 时段类型 */
export type ShiftPeriod = '安息日' | '夜间' | '早晨' | '白昼' | '空档';

const 值班语义词 = ['夜班', '值班', '守夜', '值夜', '轮班', '今晚'];

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
 * 判断当前剧情时刻所处的时段
 * - 安息日: 周日 00:00-24:00 (优先级最高)
 * - 夜间: 22:00 - 次日起床
 * - 早晨: 起床 - 交还
 * - 白昼: 交还 - 18:00
 * - 空档: 18:00 - 22:00
 */
export function getShiftPeriod(storyTime: Date, settings: Settings): ShiftPeriod {
  if (storyTime.getDay() === 0) {
    return '安息日';
  }
  const minutes = storyTime.getHours() * 60 + storyTime.getMinutes();
  const 起床 = parseTime(settings.起床时刻);
  const 交还 = parseTime(settings.交还时刻);
  if (minutes >= 22 * 60 || minutes < 起床) {
    return '夜间';
  }
  if (minutes < 交还) {
    return '早晨';
  }
  if (minutes < 18 * 60) {
    return '白昼';
  }
  return '空档';
}

/**
 * 夜班日: 夜间时段 (22:00 - 次日起床) 跨午夜, 属于同一晚.
 * 当前时刻 < 起床 (凌晨) 时, 夜班日属于前一天.
 */
export function getNightShiftDate(storyTime: Date, settings: Settings): string {
  const date = new Date(storyTime);
  const 起床 = parseTime(settings.起床时刻);
  if (date.getHours() * 60 + date.getMinutes() < 起床) {
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

/**
 * "上下文已指名": 扫描最近若干楼层文本, 若某舰娘名字附近出现
 * 夜班/值班/守夜 等语义词, 则认为剧情已指名她为夜班持有者.
 * 返回最后一个命中的名字, 否则 null.
 */
function 上下文指名(settings: Settings): string | null {
  const 深度 = Math.max(1, Math.floor(settings.最近楼层扫描数));
  let messages: ChatMessage[];
  try {
    messages = getChatMessages(-深度);
  } catch {
    return null;
  }
  const text = messages.map(message => `${message.name}：${message.message}`).join('\n');
  for (const name of getActiveShipList(settings)) {
    let 位置 = text.lastIndexOf(name);
    while (位置 !== -1) {
      const 周围 = text.slice(Math.max(0, 位置 - 60), 位置 + name.length + 60);
      if (值班语义词.some(词 => 周围.includes(词))) {
        return name;
      }
      位置 = text.lastIndexOf(name, 位置 - 1);
    }
  }
  return null;
}

const 夜班持有者条目名 = '夜班持有者';

/** 内存缓存: 避免生成前回调中异步读世界书导致错过提示词合并时机 */
let 夜班持有者缓存: { 夜班日: string; 名字: string } | null = null;

/**
 * 确定夜班持有者 (同步, 供生成前注入使用).
 * 仅夜间/早晨时段需要; 其余时段返回 null.
 * 当晚已定 (缓存或世界书) 则沿用, 否则按"上下文已指名 → 随机"选择,
 * 并异步持久化到当前聊天世界书的"夜班持有者"条目.
 */
export function determineNightHolder(storyTime: Date, settings: Settings): string | null {
  const period = getShiftPeriod(storyTime, settings);
  if (period !== '夜间' && period !== '早晨') {
    // 白天/安息日: 删除夜班持有者条目 (不重新选择, 下一晚夜间时段再确定)
    if (夜班持有者缓存) {
      void 清除夜班持有者条目();
    }
    return null;
  }
  const 夜班日 = getNightShiftDate(storyTime, settings);
  if (夜班持有者缓存?.夜班日 === 夜班日) {
    console.info(`[值班与乱入] 夜班持有者沿用: ${夜班持有者缓存.名字} (夜班日 ${夜班日})`);
    return 夜班持有者缓存.名字;
  }
  const 指名 = 上下文指名(settings);
  const 名字 = 指名 ?? pickRandomShips(getActiveShipList(settings), 1)[0];
  if (名字) {
    夜班持有者缓存 = { 夜班日, 名字 };
    console.info(`[值班与乱入] 夜班持有者确定: ${名字} (${指名 ? '上下文已指名' : '随机选择'}), 夜班日 ${夜班日}, 正在写入世界书...`);
    void 持久化夜班持有者(夜班日, 名字);
  } else {
    console.warn('[值班与乱入] 夜班持有者选择失败: 名单为空');
  }
  return 名字 ?? null;
}

/** 启动时从当前聊天世界书恢复夜班持有者缓存 (仅读取, 不创建世界书) */
export async function restoreNightHolderCache(): Promise<void> {
  try {
    const worldbook_name = getChatWorldbookName('current');
    if (!worldbook_name) {
      console.info('[值班与乱入] 当前聊天没有绑定世界书, 跳过夜班持有者缓存恢复');
      return;
    }
    const entries = await getWorldbook(worldbook_name);
    const entry = entries.find(entry => entry.name === 夜班持有者条目名);
    const 日期 = entry?.content.match(/日期：(\d{4}-\d{2}-\d{2})/)?.[1];
    const 名字 = entry?.content.match(/夜班持有者：(.+)/)?.[1];
    if (日期 && 名字) {
      夜班持有者缓存 = { 夜班日: 日期, 名字 };
      console.info(`[值班与乱入] 已从世界书恢复夜班持有者: ${名字} (夜班日 ${日期})`);
    } else {
      console.info('[值班与乱入] 世界书暂无夜班持有者条目, 将在夜间时段确定');
    }
  } catch {
    // 没有聊天文件时忽略, 生成时再处理
  }
}

/** 清空夜班持有者缓存 (聊天文件切换时调用) */
export function resetNightHolderCache(): void {
  夜班持有者缓存 = null;
}

/**
 * 白天/安息日时段: 删除当前聊天世界书中的"夜班持有者"条目并清空缓存.
 * 不重新选择, 下一晚夜间时段再由 determineNightHolder 重新确定.
 */
async function 清除夜班持有者条目(): Promise<void> {
  夜班持有者缓存 = null; // 立即清缓存, 避免重复触发删除
  try {
    const worldbook_name = getChatWorldbookName('current');
    if (!worldbook_name) {
      return;
    }
    await deleteWorldbookEntries(worldbook_name, entry => entry.name === 夜班持有者条目名);
    console.info('[值班与乱入] 白天时段, 已删除夜班持有者条目 (次日夜间重新确定)');
  } catch (error) {
    console.warn('[值班与乱入] 删除夜班持有者条目失败', error);
  }
}

/**
 * 将夜班持有者写入当前聊天世界书的"夜班持有者"条目 (不存在则创建).
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
    // 只写入当前聊天已绑定的世界书, 不创建新世界书
    const worldbook_name = getChatWorldbookName('current');
    if (!worldbook_name) {
      console.warn('[值班与乱入] 当前聊天没有绑定世界书, 不创建新世界书, 跳过夜班持有者条目写入');
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
 * 其余时段: 命中 (roll ≥ 阈值) 注入 3 名候选舰娘, 由模型自行挑选并安排出场; 不命中注入"无人乱入".
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
