import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/800.css';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css';
import './i18n';
import App from './App.tsx';
import { migrateData } from './utils/migration';

// Run migration before app starts
migrateData();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
