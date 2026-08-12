/**
 * agent-play: 多 agent 角色扮演 — 服务器插件 (骨架)
 *
 * 架构: 前后端分离
 *   - 服务器插件 (本文件): 子 agent 并发扮演 + 主 agent 循环辅助 + 注册制扩展 + ANIMA 对接
 *   - 前端插件: 触发/拦截 <agent_call>/组装上下文/注入独白/时间线 UI (另一项目目录)
 *
 * 核心玩法 (改法 1):
 *   主模型输出 <agent_call characters="凛,贝法" focus="..." /> → 前端拦截 → POST /api/agent-play/act
 *   → 本插件并发跑子 agent (便宜模型) → 返回独白 → 前端注入 → 主模型继续生成
 *
 * 注册制扩展:
 *   前端输入框粘贴注册代码 → 保存 → 生成 registered/<name>.js → 启动自动 require 加载
 *   例: agentPlay.registerProvider('memory', { name:'anima', getMemories: async ... })
 *
 * 骨架说明: 模块结构与端点已规划, 实现见 方案.md 第 12 节实施步骤.
 */

const REGISTERED_DIR = 'registered'; // 注册脚本目录 (启动时自动 require)

module.exports = {
  /** @param {import('express').Router} router */
  init(router) {
    // TODO 实施步骤:
    // 1. 端点: /act (并发扮演), /runs/:runId/events, /cancel, /config
    // 2. run-controller.js: run 生命周期 (runId/事件流/取消) — 参考 TauriTavern, 宿主重写
    // 3. actor.js: 子 agent 并发扮演 (Promise.all + 并发限制 + 超时降级) — 自研
    // 4. context-policy.js: 上下文组装 (世界书/记忆/消息/时间/乱入)
    // 5. prompt-assembly.js: 扮演提示词组装
    // 6. retry.js / rollback.js: 重试与回滚
    // 7. events.js: 事件流 (供前端时间线)
    // 8. anima-client.js: ANIMA /query 对接 + 人物过滤 (示例适配器, 经注册制接入)
    // 9. 注册制: POST /register-script → 写入 registered/<name>.js → require 加载
  },
};
