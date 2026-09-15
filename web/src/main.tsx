import '@fontsource/cinzel/latin-500.css';
import '@fontsource/cinzel/latin-600.css';
import '@fontsource/nunito-sans/latin-400.css';
import '@fontsource/nunito-sans/latin-600.css';
import '@fontsource/nunito-sans/latin-700.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing game root.');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
