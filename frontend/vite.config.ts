import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';

// 生成版本号：YYMMDDHHMMSS 格式（例如：260116140523）
function generateVersion(): string {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2); // 取后两位年份，例如 2026 -> 26
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

// 生成版本文件
const version = generateVersion();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const versionContent = `export const VERSION = '${version}';\n`;
writeFileSync(join(__dirname, 'src/version.ts'), versionContent);
console.log(`✓ Generated version: ${version}`);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: fileURLToPath(new URL('../docs', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 250, // 提高警告阈值，100KB只是建议，不是强制要求
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // 将 node_modules 中的大型依赖分离到单独的 chunk
          if (id.includes('node_modules')) {
            // lightweight-charts 图表库 - 独立 chunk，按需加载
            if (id.includes('lightweight-charts')) {
              return 'charts';
            }
            // 将所有 MUI 相关库（包括 emotion）放在一起，避免循环依赖
            // 注意：MUI 依赖 React，但我们将它们分开以避免循环依赖警告
            if (id.includes('@mui') || id.includes('@emotion')) {
              return 'mui';
            }
            // React 相关 - 放在 MUI 之后定义，确保先加载
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            // 其他 node_modules 依赖
            return 'vendor';
          }
        },
      },
    },
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
  },
});
