// Must be first: registers global crash handlers before any app module evals.
import '@/lib/globalErrorHandler';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createClient,
    LightdashProvider,
    useVizContext,
    VizContextProvider,
} from '@lightdash/query-sdk';
import { FilterProvider } from '@/lib/filters';
import { ErrorBoundary } from '@/lib/ErrorBoundary';
// Base tokens must be imported before ./App: any stylesheet the app imports
// from a component lands after these in the bundle, and `:root` and `.dark`
// have equal specificity — so whichever comes last wins. Import App first and
// the template's light `:root` overrides the app's own `.dark`, pinning it to
// light no matter what the host sends.
import './index.css';
import './chart-overrides.css';
import App from './App';
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

// A chart type renders in a frame the size of its tile; a page app grows.
// Only a chart type receives a viz context, so mark the document for index.css.
function VizFrame() {
    const { ready } = useVizContext();
    React.useEffect(() => {
        document.documentElement.toggleAttribute('data-viz-frame', ready);
    }, [ready]);
    return null;
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <LightdashProvider client={lightdash}>
                <FilterProvider>
                    <ErrorBoundary>
                        <VizContextProvider>
                            <VizFrame />
                            <App />
                        </VizContextProvider>
                    </ErrorBoundary>
                </FilterProvider>
            </LightdashProvider>
        </QueryClientProvider>
    </React.StrictMode>,
);
