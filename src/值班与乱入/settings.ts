import { createPinia, setActivePinia } from 'pinia';

/**
 * 共享 pinia 实例: 设置面板与生成前事件回调必须读写同一份设置,
 * 因此不能像示例那样各自 createPinia, 而应共用一个实例.
 */
export const pinia = createPinia();
setActivePinia(pinia);

const Settings = z
  .object({
    /** 起床时刻, 格式 HH:mm; 夜间时段为 22:00 - 次日起床 */
    起床时刻: z.string().default('06:00'),
    /** 交还时刻, 格式 HH:mm; 早晨时段为 起床 - 交还 */
    交还时刻: z.string().default('07:00'),
    /** 乱入检定阈值, 1d100 大于等于该值视为命中 */
    乱入检定阈值: z.coerce.number().default(10),
    /** "上下文已指名" 判定时扫描的最近楼层数 */
    最近楼层扫描数: z.coerce.number().default(10),
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
