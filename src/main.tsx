import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { UpdateBanner } from './app/components/UpdateBanner';
import './app/styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UpdateBanner />
    <App />
  </React.StrictMode>,
);
