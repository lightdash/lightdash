import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createClient, LightdashProvider } from '@lightdash/query-sdk';
import { FilterProvider } from '@/lib/filters';
import App from './App';
import './index.css';
import './chart-overrides.css';
import initScreenshotHandler from './screenshotHandler';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
        },
    },
});
const lightdash = createClient();

initScreenshotHandler();

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <LightdashProvider client={lightdash}>
                <FilterProvider>
                    <App />
                </FilterProvider>
            </LightdashProvider>
        </QueryClientProvider>
    </React.StrictMode>,
);
