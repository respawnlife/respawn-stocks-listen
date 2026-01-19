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
    chunkSizeWarningLimit: 100,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // 将 node_modules 中的大型依赖分离到单独的 chunk
          if (id.includes('node_modules')) {
            // MUI Material - 按子模块分割
            if (id.includes('@mui/material')) {
              // 将 Dialog 相关组件分离
              if (id.includes('@mui/material/Dialog') || 
                  id.includes('@mui/material/DialogTitle') ||
                  id.includes('@mui/material/DialogContent') ||
                  id.includes('@mui/material/DialogActions')) {
                return 'mui-dialog';
              }
              // 将 Table 相关组件分离
              if (id.includes('@mui/material/Table') ||
                  id.includes('@mui/material/TableContainer') ||
                  id.includes('@mui/material/TableHead') ||
                  id.includes('@mui/material/TableBody') ||
                  id.includes('@mui/material/TableRow') ||
                  id.includes('@mui/material/TableCell')) {
                return 'mui-table';
              }
              // 将 Select、TextField 等表单组件分离
              if (id.includes('@mui/material/Select') ||
                  id.includes('@mui/material/TextField') ||
                  id.includes('@mui/material/FormControl') ||
                  id.includes('@mui/material/InputLabel') ||
                  id.includes('@mui/material/MenuItem')) {
                return 'mui-form';
              }
              // 将 Button、Box、Typography 等基础组件分离
              if (id.includes('@mui/material/Button') ||
                  id.includes('@mui/material/Box') ||
                  id.includes('@mui/material/Typography') ||
                  id.includes('@mui/material/Paper') ||
                  id.includes('@mui/material/Container')) {
                return 'mui-base';
              }
              // 将 IconButton、Chip 等交互组件分离
              if (id.includes('@mui/material/IconButton') ||
                  id.includes('@mui/material/Chip') ||
                  id.includes('@mui/material/Collapse') ||
                  id.includes('@mui/material/Tooltip')) {
                return 'mui-interactive';
              }
              // 将 Radio、Switch、ToggleButton 等选择组件分离
              if (id.includes('@mui/material/Radio') ||
                  id.includes('@mui/material/RadioGroup') ||
                  id.includes('@mui/material/FormControlLabel') ||
                  id.includes('@mui/material/Switch') ||
                  id.includes('@mui/material/ToggleButton') ||
                  id.includes('@mui/material/ToggleButtonGroup')) {
                return 'mui-selection';
              }
              // 将 Select、MenuItem 等菜单组件分离
              if (id.includes('@mui/material/Menu') ||
                  id.includes('@mui/material/MenuList') ||
                  id.includes('@mui/material/MenuItem')) {
                return 'mui-menu';
              }
              // 其他 MUI Material 组件
              return 'mui-material';
            }
            // MUI 图标库
            if (id.includes('@mui/icons-material')) {
              return 'mui-icons';
            }
            // MUI 其他库（emotion 等）
            if (id.includes('@mui') || id.includes('@emotion')) {
              return 'mui-core';
            }
            // lightweight-charts 图表库
            if (id.includes('lightweight-charts')) {
              return 'charts';
            }
            // React 相关
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
