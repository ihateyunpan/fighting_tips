import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    const localFile = mode === 'localfile'
    return {
        plugins: [react(), tailwindcss(),],
        base: localFile ? './' : '/',
        ...(localFile ? { build: { outDir: 'dist_local' } } : {}),
    }
})
