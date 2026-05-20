import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './styles/globals.css';

declare global {
  interface Window {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: { onCommitFiberRoot?: () => void };
  }
}

// Error boundary for development
if (import.meta.env.DEV) {
  // Enable React DevTools
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot = () => {};
  }
}

// Create root and render app
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
