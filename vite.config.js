import { defineConfig } from 'vite';
export default defineConfig({base:process.env.PAGES_BASE_PATH||'/',worker:{format:'es'},build:{chunkSizeWarningLimit:800}});
