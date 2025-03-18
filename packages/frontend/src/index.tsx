import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';

if (typeof document !== 'undefined') {
    const container = document.getElementById('root');
    if (!container) throw new Error('Root element not found!');

    const root = createRoot(container);

    root.render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
} else {
    throw new Error('document not found!');
}
