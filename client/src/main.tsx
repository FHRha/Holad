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
