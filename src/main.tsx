import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { UpdateSurface } from './app/components/UpdateSurface';
import './app/styles.css';

/* `UpdateSurface` wraps the app rather than sitting beside it: while an update
   is installing it renders the whole window itself, and the control panel
   underneath would be talking to a render service that is already going down. */
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UpdateSurface>
      <App />
    </UpdateSurface>
  </React.StrictMode>,
);
