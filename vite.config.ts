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
        // Only the app's own stylesheet — the one index.html links, which Vite
        // calls index.css — keeps the fixed name styles.css that the service
        // worker and firebase.json address it by.
        //
        // Everything else is content-hashed under assets/. That includes the CSS
        // split off with a lazy chunk (cloud-init, help-screen): this rule used
        // to name those styles.css too, so the build renamed them styles2.css
        // and styles3.css — fixed names whose content changed every deploy, which
        // neither the no-cache header nor the service worker's network-first
        // list covered. Devices kept the old copies, and a redesigned login
        // shipped its new markup against last week's styles. A hashed name
        // cannot be stale: new content is a new URL. assets/ is served immutable
        // for a year, so nothing may live there without a hash.
        assetFileNames: (assetInfo) => {
          const names = assetInfo.names || (assetInfo.name ? [assetInfo.name] : []);
          if (names.includes('index.css')) {
            return 'styles.css';
          }
          return 'assets/[name]-[hash][extname]';
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





