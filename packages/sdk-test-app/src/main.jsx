import React from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import App from './App';
import i18n from './i18n';

const root = createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <I18nextProvider i18n={i18n}>
            <React.Suspense fallback="loading">
                <App />
            </React.Suspense>
        </I18nextProvider>
    </React.StrictMode>,
);
