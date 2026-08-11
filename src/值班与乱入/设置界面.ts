import { createScriptIdDiv, teleportStyle } from '@util/script';
import 界面 from './设置界面.vue';
import { pinia } from './settings';

$(() => {
  const $target = $('#extensions_settings2');
  if ($target.length === 0) {
    console.warn('[值班与乱入] 未找到 #extensions_settings2, 设置面板挂载失败');
    return;
  }

  const app = createApp(界面).use(pinia);

  const $app = createScriptIdDiv().appendTo($target);
  app.mount($app[0]);
  console.info('[值班与乱入] 设置面板已挂载到 #extensions_settings2');

  const { destroy } = teleportStyle();

  $(window).on('pagehide', () => {
    app.unmount();
    $app.remove();
    destroy();
  });
});
