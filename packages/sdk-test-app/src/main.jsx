import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import i18n from './i18n'
import { I18nextProvider } from 'react-i18next';

ReactDOM.render(
    <React.StrictMode>
        <I18nextProvider i18n={i18n}>
            <React.Suspense fallback="loading">
                <App />
            </React.Suspense>
        </I18nextProvider>
    </React.StrictMode>,

    document.getElementById('root'),
);
