import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // <--- Ajoute ça

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // <--- Et ajoute ça
  ],
})