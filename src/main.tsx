import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Register PWA Service Worker for offline caching & standalone installability
registerSW({
  immediate: true,
  onOfflineReady() {
    console.info('Exact Roofing Engine ready for offline site operation.');
  }
});

createRoot(document.getElementById('root')!).render(<App />);
