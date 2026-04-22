import { Suspense, StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import App from './App';
import i18n from './i18n';
import { RouterProvider } from './router';

const root = document.getElementById('root');

if (!root) {
    throw new Error('Root element not found');
}

ReactDOM.createRoot(root).render(
    <StrictMode>
        <I18nextProvider i18n={i18n}>
            <Suspense fallback="loading">
                <RouterProvider>
                    <App />
                </RouterProvider>
            </Suspense>
        </I18nextProvider>
    </StrictMode>,
);
