import './设置界面';
import {
  determineNightHolder,
  formatDateTime,
  formatIntrusionResult,
  getActiveShipList,
  getShiftPeriod,
  getStoryTime,
  resetNightHolderCache,
  restoreNightHolderCache,
  runIntrusionCheck,
} from './logic';
import { useSettingsStore } from './settings';

/** 从脚本变量读取最近一次乱入检定结果 */
function 读取乱入变量(): ReturnType<typeof getVariables>['乱入'] {
  return getVariables({ type: 'script', script_id: getScriptId() }).乱入;
}

$(() => {
  const { settings } = useSettingsStore();
  console.info('[值班与乱入] 脚本已加载');
  console.info(
    `[值班与乱入] 设置: 乱入阈值 ${settings.乱入检定阈值} | 夜班结束 ${settings.夜班结束时刻} | ` +
      `舰娘名单 ${getActiveShipList(settings).length} 人`,
  );

  // 从当前角色卡主世界书恢复夜班持有者缓存
  errorCatched(() => {
    void restoreNightHolderCache();
  })();

  // 切换聊天文件时, 夜班持有者属于不同聊天的世界书, 需要重置缓存
  eventOn(tavern_events.CHAT_CHANGED, () => {
    console.info('[值班与乱入] 聊天文件已切换, 重置夜班持有者缓存');
    resetNightHolderCache();
    void restoreNightHolderCache();
  });

  // 预设宏: {{乱入检定}} 展开为最近一次检定的完整结论
  registerMacroLike(/{{乱入检定}}/g, () => {
    const 乱入 = 读取乱入变量();
    return 乱入 ? formatIntrusionResult(乱入) : '';
  });

  // 预设宏: {{乱入舰娘}} 展开为候选舰娘 XML 块 (未命中/豁免时为空)
  registerMacroLike(/{{乱入舰娘}}/g, () => {
    const 乱入 = 读取乱入变量();
    if (!乱入?.候选舰娘?.length) {
      return '';
    }
    return `<乱入舰娘>\n${乱入.候选舰娘.join('\n')}\n</乱入舰娘>`;
  });

  // 每次生成前: 确定夜班持有者并写入世界书条目; 执行乱入检定,
  // 结果写入酒馆变量 (供预设宏读取), 同时注入提示词 (should_scan 激活世界书设定条目)
  // 触发时机: GENERATION_AFTER_COMMANDS (提示词合并前, 官方推荐注入时机).
  // 通过 option.automatic_trigger 区分: 后台/扩展自动触发 (true) 跳过, 用户手动操作 (发送消息、Regenerate 等) 执行.
  let 上次执行时间 = 0;
  const 执行生成前检定 = () => {
    const now = Date.now();
    if (now - 上次执行时间 < 100) {
      return;
    }
    上次执行时间 = now;

    const { settings } = useSettingsStore();
    const storyTime = getStoryTime();
    const period = getShiftPeriod(storyTime, settings);
    console.info(`[值班与乱入] ── 生成前处理 ──`);
    console.info(`[值班与乱入] 剧情时间: ${formatDateTime(storyTime)} | 时段: ${period}`);

    // 夜间时段确定夜班持有者并持久化到角色卡主世界书条目; 非夜间时段删除该条目 (夜班结束)
    const holder = determineNightHolder(storyTime, settings);
    console.info(`[值班与乱入] 夜班持有者: ${holder ?? '（非值班时段，无需确定）'}`);

    const result = runIntrusionCheck(storyTime, period, settings);
    console.info(`[值班与乱入] 乱入检定: ${result.文本.split('\n')[0]}`);
    if (result.变量.候选舰娘.length > 0) {
      console.info(`[值班与乱入] 候选舰娘(${result.变量.候选舰娘.length}): ${result.变量.候选舰娘.join('、')}`);
    }

    // 检定结果写入脚本变量 (顶层 key `乱入`, 与设置字段互不干扰)
    insertOrAssignVariables({ 乱入: result.变量 }, { type: 'script', script_id: getScriptId() });
    console.info(`[值班与乱入] 已写入酒馆变量: ${JSON.stringify(result.变量)}`);

    injectPrompts(
      [
        {
          id: '乱入检定',
          position: 'in_chat',
          depth: 0,
          role: 'system',
          content: result.文本,
          // 让命中文本中的候选舰娘名字进入世界书关键字扫描, 自动激活对应设定条目
          should_scan: true,
        },
      ],
      { once: true },
    );
    console.info(`[值班与乱入] 已注入提示词 (${result.文本.length} 字符, should_scan)`);
  };

  // 手动生成时执行; 后台自动触发 (automatic_trigger) 跳过
  eventOn(tavern_events.GENERATION_AFTER_COMMANDS, (_type, option) => {
    if (option?.automatic_trigger) {
      return;
    }
    执行生成前检定();
  });
});
