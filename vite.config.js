import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true
      },
      // localhost is not on the chatbot's allowlist, so in development the call is
      // made from this server, without a browser Origin header
      "/chatbot-api": {
        target: "https://cross-platform-chatbot.ai.vyoma.org",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/chatbot-api/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => proxyReq.removeHeader("origin"));
        }
      }
    }
  }
})
