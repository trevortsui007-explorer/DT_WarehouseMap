import { createApp } from 'vue';
import App from './App.vue';
import './styles/editor.css';

// 启动 Vue 外壳；地图模型、编辑流程与渲染器由后续 bootstrap 组装。
createApp(App).mount('#app');
