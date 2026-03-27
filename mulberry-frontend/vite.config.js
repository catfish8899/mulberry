// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'; // 引入 Tailwind CSS 的 Vite 专用插件

/**
 * Vite 项目配置
 * 使用 @tailwindcss/vite 插件替代传统的 postcss 编译管线
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
});
