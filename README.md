# Manholes Mapper PWA

A professional Progressive Web Application (PWA) for infrastructure mapping and field data collection. Built for offline-first operations with real-time canvas-based visualization.

## Overview

Manholes Mapper is a lightweight, high-performance web application designed for field workers to capture and manage infrastructure network data. The application supports offline operations, bilingual interfaces (Hebrew/English), and seamless data export for GIS integration.

## Key Features

- **Canvas-based Graph Editor**: Interactive node-edge network visualization
- **Offline-First Architecture**: Full functionality without internet connectivity using IndexedDB
- **Progressive Web App**: Installable on mobile and desktop devices
- **Bilingual Support**: Hebrew (RTL) and English (LTR) interfaces
- **Data Export**: CSV export for ArcGIS integration, JSON export for backup/sharing
- **Mobile Optimized**: Touch gestures, responsive design, and mobile-friendly input methods
- **Real-time Autosave**: Automatic data persistence to prevent data loss

## Technology Stack

- **Frontend**: Vanilla JavaScript (ES Modules)
- **Build Tool**: Vite 7.x
- **Rendering**: HTML5 Canvas API
- **Storage**: IndexedDB with localStorage fallback
- **Offline**: Service Worker with caching strategies
- **Code Quality**: ESLint, Prettier
- **Languages**: TypeScript (configuration only)

## Project Structure

```
manholes-mapper-pwa-app-updated/
├── src/                    # Application source code
│   ├── admin/              # Admin configuration UI
│   ├── db.js               # IndexedDB operations
│   ├── dom/                # DOM utilities
│   ├── features/           # Canvas rendering and drawing
│   ├── graph/              # Graph data structures and utilities
│   ├── i18n.js             # Internationalization
│   ├── legacy/             # Legacy monolithic code (being modularized)
│   ├── main-entry.js       # Application entry point
│   ├── serviceWorker/      # Service worker registration
│   ├── state/              # State management and constants
│   └── utils/              # Utility functions (CSV, geometry, etc.)
├── public/                 # Static assets
│   ├── service-worker.js   # Service worker
│   ├── manifest.json       # PWA manifest
│   ├── offline.html        # Offline fallback page
│   └── *.png               # App icons and images
├── dist/                   # Production build output
├── index.html              # Main HTML template
├── styles.css              # Application styles
├── vite.config.ts          # Vite configuration
└── package.json            # Project dependencies

```

## Getting Started

### Prerequisites

- Node.js 16.x or higher
- npm 7.x or higher

### Installation

```bash
# Install dependencies
npm install
```

### Development

```bash
# Start development server
npm run dev

# The application will be available at http://localhost:5173
```

### Building for Production

```bash
# Create optimized production build
npm run build

# Preview production build locally
npm run preview
```

### Code Quality

```bash
# Run linter
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Format code with Prettier
npm run format
```

## Deployment

The application is built with a relative base path (`./`) for flexible deployment options:

1. Build the application: `npm run build`
2. Deploy the `dist/` directory to your hosting platform
3. Ensure HTTPS is enabled for service worker functionality
4. The app will automatically register the service worker and enable offline mode

### Deployment Platforms

Compatible with:
- GitHub Pages
- Netlify
- Vercel
- AWS S3 + CloudFront
- Azure Static Web Apps
- Any static hosting service

## PWA Features

- **Installable**: Add to home screen on mobile devices
- **Offline Support**: Full functionality without internet
- **Auto-updates**: Service worker automatically updates the application
- **Responsive**: Adapts to all screen sizes and orientations
- **Performance**: Optimized caching strategies for fast load times

## Data Management

### Export Formats

- **CSV Export**: Node and edge data for ArcGIS/Excel analysis
- **JSON Export**: Complete sketch backup with coordinates for import/sharing

### Storage

- **Primary**: IndexedDB for offline-first persistence
- **Fallback**: localStorage for compatibility
- **Auto-save**: Configurable automatic saving

## Browser Support

- Chrome/Edge 90+
- Safari 14+
- Firefox 88+
- Mobile browsers with service worker support

## Development Notes

- Service worker only functions in production builds or over HTTPS
- The `src/legacy/main.js` file is being progressively modularized
- Build outputs stable filenames (`main.js`, `styles.css`) for service worker cache compatibility
- Use the health check endpoint at `/health/` for monitoring

## Architecture

The application follows a modular architecture with clear separation of concerns:

- **State Management**: Centralized in `src/state/`
- **Data Layer**: IndexedDB operations in `src/db.js`
- **Rendering**: Canvas rendering logic in `src/features/`
- **Internationalization**: Translation system in `src/i18n.js`
- **Utilities**: Reusable functions in `src/utils/`

## Contributing

When adding new features:
1. Follow the existing code style (ESLint/Prettier)
2. Add translations for both Hebrew and English
3. Update relevant documentation
4. Test offline functionality
5. Ensure mobile compatibility

## License

Proprietary - All rights reserved

---

**Built with modern web technologies for professional infrastructure mapping**

