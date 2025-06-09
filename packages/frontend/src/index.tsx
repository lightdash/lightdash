// eslint-disable-next-line import/order
import { scan } from 'react-scan'; // react-scan has to be imported before react

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';

// Trigger FE tests
scan({
    enabled: import.meta.env.DEV,
});

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found!');

const root = createRoot(container);

root.render(
    <StrictMode>
        <App />
    </StrictMode>,
);
