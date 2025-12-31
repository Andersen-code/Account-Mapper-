
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error("Mounting error:", error);
  rootElement.innerHTML = `
    <div style="padding: 40px; text-align: center; color: #ef4444; font-family: sans-serif;">
      <h2 style="font-weight: 800;">Render Error</h2>
      <p style="color: #64748b;">${error instanceof Error ? error.message : 'Unknown error'}</p>
    </div>
  `;
}