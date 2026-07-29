import { defineConfig } from 'vite'
import { existsSync } from 'node:fs'

const hasLocalCerts = existsSync('./manholes-mapper.local+5.pem') && existsSync('./manholes-mapper.local+5-key.pem')

export default defineConfig({
  // Use a relative base so that the built index.html references JS/CSS using
  // relative URLs.  This makes it possible to serve the app from a file
  // system or arbitrary path (including on mobile devices) without broken
  // absolute paths like "/assets/*.js".
  base: './',
  // Customise the Rollup output so that entry points and CSS use stable file
  // names instead of hashed names.  The service worker expects to find
  // `main.js` and `styles.css` at runtime.  Other assets can still be
  // fingerprinted and will be cached by the runtime caching strategy.
  build: {
    rollupOptions: {
      output: {
        // The main entry file will be emitted as `main.js` in the output
        entryFileNames: 'main.js',
        // CSS emitted by Vite is placed into a single file called styles.css
        // rather than using a hash.  This ensures the service worker can
        // precache the stylesheet reliably.
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'styles.css';
          }
          // Place other assets into the `assets` directory with their original
          // names (Vite will append a content hash automatically).
          return 'assets/[name][extname]';
        },
      },
    },
  },
  server: {
    host: true,        // binds to 0.0.0.0
    https: hasLocalCerts ? {
      cert: './manholes-mapper.local+5.pem',
      key: './manholes-mapper.local+5-key.pem',
    } : false,
    // Use custom HMR settings only when running with local HTTPS
    hmr: hasLocalCerts ? {
      protocol: 'wss',
      host: 'manholes-mapper.local',
      port: 5173,
    } : undefined,
  },
  preview: {
    host: true,
    https: hasLocalCerts ? {
      cert: './manholes-mapper.local+5.pem',
      key: './manholes-mapper.local+5-key.pem',
    } : false
  }
})





