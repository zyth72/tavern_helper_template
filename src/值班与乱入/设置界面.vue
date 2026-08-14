<template>
  <div class="shift-intrusion-settings">
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>{{ `值班与乱入` }}</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <div class="flex-container">
          <label for="intrusion-threshold">乱入检定阈值（1d100 ≥ 阈值即命中）</label>
          <input id="intrusion-threshold" v-model.number="settings.乱入检定阈值" type="number" min="1" max="100" />
        </div>

        <div class="flex-container">
          <label for="night-end-time">夜班结束时刻（到点删除夜班持有者条目）</label>
          <input id="night-end-time" v-model="settings.夜班结束时刻" type="time" />
        </div>

        <div class="flex-container">
          <label for="custom-ship-list">自定义舰娘名单（每行一个名字，留空则使用内置完整名单）</label>
          <textarea id="custom-ship-list" v-model="自定义名单文本" class="text_pole" rows="5"></textarea>
        </div>

        <hr class="sysHR" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from './settings';

const { settings } = storeToRefs(useSettingsStore());

const 自定义名单文本 = computed({
  get: () => settings.value.自定义舰娘名单.join('\n'),
  set: (value: string) => {
    settings.value.自定义舰娘名单 = value
      .split('\n')
      .map(name => name.trim())
      .filter(Boolean);
  },
});
</script>

<style scoped>
.shift-intrusion-settings .flex-container {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
}

.shift-intrusion-settings .flex-container label {
  flex: 0 0 auto;
}

/* 深色背景下输入框需要深色底 + 浅色字, 否则白底白字看不清 */
.shift-intrusion-settings input[type='time'],
.shift-intrusion-settings input[type='number'],
.shift-intrusion-settings textarea {
  background-color: #2a2a2a !important;
  color: #e8e8e8 !important;
  border: 1px solid #555 !important;
  border-radius: 4px !important;
  padding: 4px 6px !important;
  color-scheme: dark; /* 原生 time picker / 滚动条适配深色 */
}

.shift-intrusion-settings .flex-container input[type='time'],
.shift-intrusion-settings .flex-container input[type='number'] {
  width: 120px;
}

.shift-intrusion-settings textarea {
  width: 100%;
}
</style>
