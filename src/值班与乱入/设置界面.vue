<template>
  <div class="shift-intrusion-settings">
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>{{ `值班与乱入` }}</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <div class="flex-container">
          <label for="shift-wake-time">起床时刻（夜间至此时为止）</label>
          <input id="shift-wake-time" v-model="settings.起床时刻" type="time" />
        </div>

        <div class="flex-container">
          <label for="shift-handover-time">交还时刻（早晨至此时为止）</label>
          <input id="shift-handover-time" v-model="settings.交还时刻" type="time" />
        </div>

        <div class="flex-container">
          <label for="intrusion-threshold">乱入检定阈值（1d100 ≥ 阈值即命中）</label>
          <input id="intrusion-threshold" v-model.number="settings.乱入检定阈值" type="number" min="1" max="100" />
        </div>

        <div class="flex-container">
          <label for="scan-depth">"上下文已指名"扫描最近楼层数</label>
          <input id="scan-depth" v-model.number="settings.最近楼层扫描数" type="number" min="1" max="100" />
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

.shift-intrusion-settings .flex-container input[type='time'],
.shift-intrusion-settings .flex-container input[type='number'] {
  width: 120px;
}

.shift-intrusion-settings textarea {
  width: 100%;
}
</style>
