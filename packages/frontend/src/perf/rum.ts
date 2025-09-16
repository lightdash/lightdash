import { onCLS, onINP, onLCP } from 'web-vitals';

type V = {
    name: string;
    value: number;
    rating: string;
    id: string;
    delta: number;
};

const push = (metric: V) => {
    (window as any).__webVitals = (window as any).__webVitals || [];
    (window as any).__webVitals.push({
        ...metric,
        ts: performance.now(),
        url: window.location.pathname + window.location.search,
        build: (window as any).__BUILD_SHA || process.env.BUILD_SHA || 'dev',
    });
};

onLCP(push);
onINP(push);
onCLS(push);
