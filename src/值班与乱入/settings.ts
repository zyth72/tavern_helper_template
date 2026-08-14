import { createPinia, setActivePinia } from 'pinia';

/**
 * 共享 pinia 实例: 设置面板与生成前事件回调必须读写同一份设置,
 * 因此不能像示例那样各自 createPinia, 而应共用一个实例.
 */
export const pinia = createPinia();
setActivePinia(pinia);

const Settings = z
  .object({
    /** 乱入检定阈值, 1d100 大于等于该值视为命中 */
    乱入检定阈值: z.coerce.number().default(10),
    /**
     * 夜班结束时刻, 格式 HH:mm; 夜间时段为 22:00 - 次日该时刻,
     * 到点后删除"夜班持有者"条目 (夜班结束)
     */
    夜班结束时刻: z.string().regex(/^\d{2}:\d{2}$/).default('06:00'),
    /**
     * 自定义舰娘名单, 每行一个名字; 留空则使用内置完整名单.
     * 主要用于覆盖/追加新舰娘, 无需重复内置名单.
     */
    自定义舰娘名单: z.array(z.string()).default([]),
  })
  .prefault({});

export type Settings = z.infer<typeof Settings>;

export const useSettingsStore = defineStore('值班与乱入设置', () => {
  const settings = ref(Settings.parse(getVariables({ type: 'script', script_id: getScriptId() })));

  watchEffect(() => {
    insertOrAssignVariables(klona(settings.value), { type: 'script', script_id: getScriptId() });
  });

  return { settings };
});
