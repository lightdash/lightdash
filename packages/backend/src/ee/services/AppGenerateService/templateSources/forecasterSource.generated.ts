// GENERATED from the reference implementation at
// lightdash-demo-data-gardening/dbt-bigquery/lightdash/apps/metric-forecaster
// (fresh-authored, no external lineage). Only authored files are included;
// scaffold files (src/lib, src/components/ui, css, screenshotHandler) come
// from the sandbox image. Regenerate by re-running the porting script
// against the reference app rather than editing by hand.

export type TemplateSourceFile = {
    /** Path relative to /app in the sandbox. */
    filename: string;
    contents: string;
};

export const FORECASTER_SOURCE_FILES: TemplateSourceFile[] = [
    {
        filename: 'template.json',
        contents: `{
    "templateVersion": 1,
    "template": {
        "id": "metric-forecaster",
        "name": "Metric Forecaster",
        "category": "Forecasting",
        "description": "Monthly actuals plus a live what-if forecast for any governed metric: growth and seasonality seeded from history, an optional efficiency lever, a planned step change, and a copyable plan summary.",
        "agentInstructionsFile": "AGENTS.md"
    },
    "bindings": {
        "history": {
            "explore": "orders",
            "timeDimension": "order_date_month",
            "primaryMetric": "total_order_amount",
            "ceilingMetric": null
        }
    },
    "parameters": {
        "growth": {
            "enabled": true,
            "default": "auto",
            "min": 0,
            "max": 6,
            "step": 0.1
        },
        "efficiency": {
            "enabled": false,
            "default": 0,
            "min": 0,
            "max": 75,
            "step": 5,
            "reducibleShare": 0.19
        },
        "step": {
            "enabled": true,
            "defaultMonth": null,
            "monthChoices": [
                3,
                6,
                9,
                12,
                15,
                18
            ],
            "defaultSize": 25000,
            "minSize": 5000,
            "maxSize": 100000,
            "sizeStep": 5000
        }
    },
    "labels": {
        "eyebrow": "Finance",
        "title": "Revenue",
        "titleAccent": "Forecaster",
        "tagline": "Monthly revenue actuals and a live scenario forecast: drag the levers and watch the trajectory, the run rate, and the campaign payoff respond.",
        "valueNoun": "revenue",
        "seriesLabel": "Revenue",
        "ceilingLabel": null,
        "growth": {
            "label": "Revenue Growth",
            "hint": "Historical rate is the default; drag to test other assumptions"
        },
        "efficiency": {
            "label": "Efficiency Uplift",
            "hint": "share of the measured reducible spend recovered"
        },
        "step": {
            "label": "Planned Campaign",
            "hint": "When the marketing push lands",
            "sizeLabel": "Campaign Lift",
            "sizeHint": "Monthly revenue added once the push lands",
            "noneLabel": "No campaign planned"
        },
        "chart": {
            "title": "Revenue Trajectory",
            "description": "Monthly actuals, then the scenario forecast. Seasonality is derived from the actuals, so the seasonal shape bends the curve; the dashed line is the untouched baseline."
        },
        "unit": {
            "kind": "currency",
            "symbol": "$"
        }
    },
    "theme": {
        "mode": "dark",
        "vars": {
            "--background": "#111713",
            "--foreground": "#eef4ec",
            "--card": "#18211a",
            "--card-foreground": "#eef4ec",
            "--popover": "#18211a",
            "--popover-foreground": "#eef4ec",
            "--primary": "#8fd06d",
            "--primary-foreground": "#0c1408",
            "--secondary": "#22301f",
            "--secondary-foreground": "#eef4ec",
            "--muted": "#202b1e",
            "--muted-foreground": "#9db39a",
            "--accent": "#22301f",
            "--accent-foreground": "#eef4ec",
            "--border": "#2a3a28",
            "--input": "#2a3a28",
            "--ring": "#8fd06d",
            "--chart-1": "#8fd06d"
        }
    }
}
`,
    },
    {
        filename: 'src/App.jsx',
        contents: `import { ErrorBoundary } from '@/lib/ErrorBoundary';
import { ForecastProvider } from './components/ForecastProvider';
import ControlRail from './components/ControlRail';
import OutcomeStrip from './components/OutcomeStrip';
import TrajectoryChart from './components/TrajectoryChart';
import PlanCard from './components/PlanCard';
import { labels, shellClass } from './template';
import './app.css';

function App() {
    return (
        <ForecastProvider>
            <div className={\`\${shellClass} app-shell bg-background text-foreground min-h-screen\`}>
                <div data-screenshot-bounds className="mx-auto max-w-6xl px-6 pt-10 pb-14 lg:px-10">
                    <header className="rise rise-1 flex flex-wrap items-end justify-between gap-x-10 gap-y-3 border-b border-border pb-6">
                        <div>
                            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                                {labels.eyebrow}
                            </p>
                            <h1 className="mt-2 font-serif text-5xl italic leading-none tracking-tight">
                                {labels.title}{' '}
                                <span className="text-primary">{labels.titleAccent}</span>
                            </h1>
                        </div>
                        <p className="max-w-sm pb-1 text-right text-sm leading-relaxed text-muted-foreground">
                            {labels.tagline}
                        </p>
                    </header>

                    <div className="mt-8 grid gap-10 lg:grid-cols-[270px_minmax(0,1fr)]">
                        <ErrorBoundary>
                            <ControlRail className="rise rise-2" />
                        </ErrorBoundary>

                        <div className="min-w-0 space-y-8">
                            <ErrorBoundary>
                                <OutcomeStrip className="rise rise-2" />
                            </ErrorBoundary>
                            <ErrorBoundary>
                                <TrajectoryChart className="rise rise-3" />
                            </ErrorBoundary>
                            <ErrorBoundary>
                                <PlanCard className="rise rise-4" />
                            </ErrorBoundary>
                        </div>
                    </div>

                    <footer className="mt-10 border-t border-border pt-4 font-mono text-[11px] text-muted-foreground">
                        Sample data for demonstration · projections run in-app on governed
                        semantic-layer metrics · scenario state lives in the URL, so any
                        plan is shareable as a link
                    </footer>
                </div>
            </div>
        </ForecastProvider>
    );
}

export default App;
`,
    },
    {
        filename: 'src/app.css',
        contents: `/* App-authored styles for the metric-forecaster template. Scaffold styles live
   in index.css / chart-overrides.css and stay untouched; brand colors come in
   at runtime from template.json via src/template.js. Everything here is
   expressed in theme tokens so it survives any theme slot. */

/* Faint atmospheric wash keyed to the theme's primary — sits on the shell,
   outside the screenshot bounds, so deliveries crop it with the content. */
.app-shell {
    background-image: radial-gradient(
        1100px 520px at 10% -10%,
        color-mix(in oklab, var(--primary) 8%, transparent),
        transparent 60%
    );
    background-repeat: no-repeat;
}

/* Staggered load reveal. One orchestrated entrance, then the page is still. */
@keyframes rise {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: none;
    }
}
.rise {
    animation: rise 0.45s ease-out both;
}
.rise-1 { animation-delay: 0.04s; }
.rise-2 { animation-delay: 0.12s; }
.rise-3 { animation-delay: 0.2s; }
.rise-4 { animation-delay: 0.28s; }

@media (prefers-reduced-motion: reduce) {
    .rise {
        animation: none;
    }
}

/* Levers: hairline range inputs in the theme's accent. */
input[type='range'].lever {
    accent-color: var(--primary);
    width: 100%;
    cursor: pointer;
}

/* A lever block signals "moved off default" with its rule line. */
.lever-block {
    border-left: 2px solid var(--border);
    padding-left: 14px;
    transition: border-color 0.2s ease;
}
.lever-block[data-active='true'] {
    border-left-color: var(--primary);
}
`,
    },
    {
        filename: 'src/template.js',
        contents: `// Template runtime: loads template.json, validates the binding contract, and
// exposes typed-ish accessors so no component ever hardcodes an explore, field
// ID, label, or brand color. Instantiating this template into another project
// is a template.json edit plus re-upload — src/ should not need to change.
import manifest from '../template.json';

function fail(message) {
    throw new Error(\`[metric-forecaster template] \${message} — check template.json\`);
}

const h = manifest?.bindings?.history;
if (!h) fail('bindings.history is missing');
for (const key of ['explore', 'timeDimension', 'primaryMetric']) {
    if (typeof h[key] !== 'string' || !h[key]) fail(\`bindings.history.\${key} is required\`);
}
if (h.ceilingMetric !== null && typeof h.ceilingMetric !== 'string') {
    fail('bindings.history.ceilingMetric must be a field ID or null');
}
if (manifest.templateVersion !== 1) fail('unsupported templateVersion');

export const template = manifest.template;
export const bindings = manifest.bindings;
export const parameters = manifest.parameters;
export const labels = manifest.labels;

// "capacity" when a ceiling metric is bound (forecast vs a limit: cost vs
// committed spend, usage vs capacity); "trajectory" when not (forecast the
// series on its own: revenue, orders).
export const mode = h.ceilingMetric ? 'capacity' : 'trajectory';

// Tailwind shell class for the app root, from the theme slot's mode.
export const shellClass = (manifest.theme?.mode ?? 'dark') === 'light' ? '' : 'dark';

const unit = labels?.unit ?? { kind: 'number' };

// Compact display of a bound-metric value in the template's unit.
export function formatValue(v) {
    if (!Number.isFinite(v)) return '—';
    const sign = v < 0 ? '-' : '';
    const abs = Math.abs(v);
    const prefix = unit.kind === 'currency' ? (unit.symbol ?? '$') : '';
    if (abs >= 1_000_000) return \`\${sign}\${prefix}\${(abs / 1_000_000).toFixed(1)}M\`;
    if (abs >= 1_000) return \`\${sign}\${prefix}\${Math.round(abs / 1000)}K\`;
    return \`\${sign}\${prefix}\${Math.round(abs)}\`;
}

// Applies the theme slot: raw CSS custom properties on <html>, where inline
// styles win over both the :root and .dark stylesheet values and cascade into
// Radix portals rendered under <body>. Also sets the dark class on <html> so
// portaled surfaces resolve dark token values for anything not overridden.
export function applyTheme() {
    const theme = manifest.theme ?? {};
    const root = document.documentElement;
    if ((theme.mode ?? 'dark') !== 'light') root.classList.add('dark');
    for (const [name, value] of Object.entries(theme.vars ?? {})) {
        if (name.startsWith('--') && typeof value === 'string') {
            root.style.setProperty(name, value);
        }
    }
}
`,
    },
    {
        filename: 'src/main.jsx',
        contents: `// Must be first: registers global crash handlers before any app module evals.
import '@/lib/globalErrorHandler';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createClient,
    LightdashProvider,
    VizContextProvider,
} from '@lightdash/query-sdk';
import { FilterProvider } from '@/lib/filters';
import { ErrorBoundary } from '@/lib/ErrorBoundary';
import App from './App';
import './index.css';
import './chart-overrides.css';
import initScreenshotHandler from './screenshotHandler';
import { applyTheme } from './template';

applyTheme();

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
                    <ErrorBoundary>
                        <VizContextProvider>
                            <App />
                        </VizContextProvider>
                    </ErrorBoundary>
                </FilterProvider>
            </LightdashProvider>
        </QueryClientProvider>
    </React.StrictMode>,
);
`,
    },
    {
        filename: 'src/components/ForecastProvider.jsx',
        contents: `import { createContext, useContext, useMemo } from 'react';
import { query, useLightdash, useUrlState } from '@lightdash/query-sdk';
import { addMonths, format as formatDateFns, parseISO } from 'date-fns';
import { bindings, parameters, mode } from '../template';

const HORIZON = 30; // months projected
const CHART_HORIZON = 18; // months drawn
const RAMP_MONTHS = 3; // efficiency phases in over a quarter

// The template's one data dependency: a monthly series from the bound explore.
// Growth default, seasonal shape, and the projection are all derived from it.
const h = bindings.history;
const historyQuery = query(h.explore)
    .label('Forecast History')
    .dimensions([h.timeDimension])
    .metrics([h.primaryMetric, ...(h.ceilingMetric ? [h.ceilingMetric] : [])])
    .sorts([{ field: h.timeDimension, direction: 'asc' }])
    .limit(60);

const ForecastContext = createContext(null);

function clamp(raw, fallback, min, max) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

// Calendar-month seasonal index, mean-normalised to 1. Months never observed
// in the history get a neutral 1 so the projection stays defined.
function seasonalIndex(history) {
    const sums = Array(12).fill(0);
    const counts = Array(12).fill(0);
    for (const row of history) {
        const m = parseISO(row.month).getUTCMonth();
        sums[m] += row.value;
        counts[m] += 1;
    }
    const means = sums.map((s, i) => (counts[i] ? s / counts[i] : null));
    const observed = means.filter((v) => v !== null && v > 0);
    if (!observed.length) return Array(12).fill(1);
    const grand = observed.reduce((a, b) => a + b, 0) / observed.length;
    return means.map((v) => (v !== null && grand > 0 ? v / grand : 1));
}

// Trend fit for messy real-world series (month gaps, spikes, sparse tails):
// growth comes from an OLS on ln(deseasonalised value) over CALENDAR month
// offsets (so gaps do not compress time), and the projection anchors on the
// mean of the last six observed months - the recent run rate - rather than a
// regression extrapolation or the raw final data point, either of which a
// single sparse month can wreck.
function monthOffset(fromIso, toIso) {
    const a = parseISO(fromIso);
    const b = parseISO(toIso);
    return (
        (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
        (b.getUTCMonth() - a.getUTCMonth())
    );
}

function fitTrend(history, idx) {
    const observed = history.filter((row) => row.value > 0);
    const anchorWindow = observed.slice(-6);
    const anchorValue = anchorWindow.length
        ? anchorWindow.reduce((a, row) => a + row.value, 0) /
          anchorWindow.length
        : 0;
    const fallback = { growthPct: 1.0, anchorValue };
    if (observed.length < 6) return fallback;
    const origin = history[0].month;
    const pts = observed.map((row) => [
        monthOffset(origin, row.month),
        Math.log(row.value / (idx[parseISO(row.month).getUTCMonth()] || 1)),
    ]);
    const n = pts.length;
    const mx = pts.reduce((a, p) => a + p[0], 0) / n;
    const my = pts.reduce((a, p) => a + p[1], 0) / n;
    let num = 0;
    let den = 0;
    for (const [x, y] of pts) {
        num += (x - mx) * (y - my);
        den += (x - mx) * (x - mx);
    }
    if (den === 0) return fallback;
    return {
        growthPct: Math.round((Math.exp(num / den) - 1) * 1000) / 10,
        anchorValue,
    };
}

// Pure projection: history in, months out. A step change lands on the ceiling
// when one is bound (a capacity/commitment buy) and on the value itself when
// not (a level shift such as a campaign).
function project({ history, idx, anchorValue, growthPct, efficiencyPct, reducibleShare, stepMonth, stepSize }) {
    if (!history.length) return { points: [], thresholdMonth: null, fullMonth: null };
    const last = history[history.length - 1];
    const lastDate = parseISO(last.month);
    let value = anchorValue;
    let ceiling = last.ceiling;
    const monthlyReduction = (efficiencyPct / 100) * (anchorValue * reducibleShare) / RAMP_MONTHS;
    const points = [];
    let thresholdMonth = null;
    let fullMonth = null;
    for (let m = 1; m <= HORIZON; m += 1) {
        const date = addMonths(lastDate, m);
        const seasonal = idx[date.getUTCMonth()] ?? 1;
        value *= 1 + (growthPct / 100) * seasonal;
        if (m <= RAMP_MONTHS) value = Math.max(0, value - monthlyReduction);
        if (stepMonth !== null && m === stepMonth) {
            if (ceiling !== null) ceiling += stepSize;
            else value += stepSize;
        }
        let util = null;
        if (ceiling !== null && ceiling > 0) {
            util = value / ceiling;
            if (thresholdMonth === null && util >= 0.9) thresholdMonth = m;
            if (fullMonth === null && util >= 1) fullMonth = m;
        }
        points.push({ month: formatDateFns(date, 'yyyy-MM') + '-01', value, ceiling, util });
    }
    return { points, thresholdMonth, fullMonth };
}

export function ForecastProvider({ children }) {
    const result = useLightdash(historyQuery);

    const [growthRaw, setGrowth] = useUrlState('growth', 'auto');
    const [efficiencyRaw, setEfficiency] = useUrlState('eff', String(parameters.efficiency?.default ?? 0));
    const stepDefaultMonth = parameters.step?.defaultMonth ?? null;
    const [stepMonthRaw, setStepMonth] = useUrlState('stepIn', stepDefaultMonth === null ? 'none' : String(stepDefaultMonth));
    const [stepSizeRaw, setStepSize] = useUrlState('stepSize', String(parameters.step?.defaultSize ?? 0));

    const value = useMemo(() => {
        const rows = result.data.map((r) => ({
            month: r[h.timeDimension],
            value: r[h.primaryMetric] ?? 0,
            ceiling: h.ceilingMetric ? r[h.ceilingMetric] ?? 0 : null,
        }));
        // Trim trailing empty months: seeded and real datasets often end on a
        // partial or empty period, and anchoring the projection on a zero
        // month flatlines every derived number.
        let end = rows.length;
        while (end > 1 && rows[end - 1].value <= 0) end -= 1;
        const history = rows.slice(0, end);

        const idx = seasonalIndex(history);
        const p = parameters;
        const trend = fitTrend(history, idx);
        const autoGrowth = clamp(trend.growthPct, 1, p.growth?.min ?? 0, p.growth?.max ?? 6);
        const reducibleShare = p.efficiency?.reducibleShare ?? 0;

        const growthPct =
            !p.growth?.enabled || growthRaw === 'auto'
                ? autoGrowth
                : clamp(growthRaw, autoGrowth, p.growth.min, p.growth.max);
        const efficiencyPct = p.efficiency?.enabled
            ? clamp(efficiencyRaw, p.efficiency.default, p.efficiency.min, p.efficiency.max)
            : 0;
        const choices = p.step?.monthChoices ?? [];
        const stepParsed = Number(stepMonthRaw);
        const stepMonth =
            !p.step?.enabled || stepMonthRaw === 'none' || !choices.includes(stepParsed)
                ? null
                : stepParsed;
        const stepSize = p.step?.enabled
            ? clamp(stepSizeRaw, p.step.defaultSize, p.step.minSize, p.step.maxSize)
            : 0;

        const base = { history, idx, anchorValue: trend.anchorValue, reducibleShare };
        const scenario = project({ ...base, growthPct, efficiencyPct, stepMonth, stepSize });
        const baseline = project({ ...base, growthPct: autoGrowth, efficiencyPct: 0, stepMonth: null, stepSize: 0 });
        const scenarioNoStep = project({ ...base, growthPct, efficiencyPct, stepMonth: null, stepSize: 0 });

        const lastActual = history[history.length - 1];
        const sumTwelve = (sim) => sim.points.slice(0, 12).reduce((a, pt) => a + pt.value, 0);
        const isDirty =
            (p.growth?.enabled && growthRaw !== 'auto') ||
            efficiencyPct !== (p.efficiency?.enabled ? p.efficiency.default : 0) ||
            stepMonth !== (p.step?.enabled ? stepDefaultMonth : null) ||
            (p.step?.enabled && stepSize !== p.step.defaultSize);

        return {
            mode,
            loading: result.loading,
            error: result.error,
            lineage: result.lineage,
            history,
            lastActual,
            reducibleShare,
            reduciblePerYr: lastActual ? lastActual.value * reducibleShare * 12 : 0,
            reclaimedPerYr: lastActual
                ? (efficiencyPct / 100) * lastActual.value * reducibleShare * 12
                : 0,
            autoGrowth,
            levers: { growthPct, efficiencyPct, stepMonth, stepSize },
            setters: { setGrowth, setEfficiency, setStepMonth, setStepSize },
            isDirty,
            resetScenario: () => {
                setGrowth('auto');
                setEfficiency(String(p.efficiency?.default ?? 0));
                setStepMonth(stepDefaultMonth === null ? 'none' : String(stepDefaultMonth));
                setStepSize(String(p.step?.defaultSize ?? 0));
            },
            scenario,
            baseline,
            scenarioNoStep,
            twelveMonthTotals: {
                scenario: sumTwelve(scenario),
                baseline: sumTwelve(baseline),
                noStep: sumTwelve(scenarioNoStep),
            },
            chartHorizon: CHART_HORIZON,
        };
    }, [result.data, result.loading, result.error, result.lineage, growthRaw, efficiencyRaw, stepMonthRaw, stepSizeRaw, setGrowth, setEfficiency, setStepMonth, setStepSize, stepDefaultMonth]);

    return <ForecastContext.Provider value={value}>{children}</ForecastContext.Provider>;
}

export function useForecast() {
    return useContext(ForecastContext);
}

export function monthAt(offset, lastActualMonth) {
    if (!lastActualMonth) return '';
    return formatDateFns(addMonths(parseISO(lastActualMonth), offset), 'MMM yyyy');
}
`,
    },
    {
        filename: 'src/components/ControlRail.jsx',
        contents: `import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { RotateCcw } from 'lucide-react';
import { useForecast } from './ForecastProvider';
import { labels, parameters, formatValue } from '../template';

function Lever({ label, value, hint, active, children }) {
    return (
        <div className="lever-block space-y-2" data-active={active ? 'true' : 'false'}>
            <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    {label}
                </span>
                <span className={\`text-sm font-semibold tabular-nums \${active ? 'text-primary' : ''}\`}>
                    {value}
                </span>
            </div>
            {children}
            <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
        </div>
    );
}

// The rail renders only the levers the template declares enabled — a disabled
// parameter simply isn't offered, which is how a template instantiation
// narrows what its users can change.
export default function ControlRail({ className = '' }) {
    const f = useForecast();
    const { growthPct, efficiencyPct, stepMonth, stepSize } = f.levers;
    const { setGrowth, setEfficiency, setStepMonth, setStepSize } = f.setters;
    const p = parameters;

    return (
        <aside className={\`\${className} space-y-7 self-start lg:sticky lg:top-8\`}>
            <div className="flex items-center justify-between border-b border-border pb-3">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                    Scenario
                </h2>
                {f.isDirty ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-muted-foreground"
                        onClick={f.resetScenario}
                    >
                        <RotateCcw className="mr-1 h-3 w-3" /> Reset
                    </Button>
                ) : null}
            </div>

            {p.growth?.enabled ? (
                <Lever
                    label={labels.growth.label}
                    value={\`\${growthPct.toFixed(1)}%/mo\`}
                    hint={\`Fitted from history: \${f.autoGrowth.toFixed(1)}% per month. \${labels.growth.hint}.\`}
                    active={growthPct !== f.autoGrowth}
                >
                    <input
                        type="range"
                        className="lever"
                        min={p.growth.min}
                        max={p.growth.max}
                        step={p.growth.step}
                        value={growthPct}
                        onChange={(e) => setGrowth(e.target.value)}
                    />
                </Lever>
            ) : null}

            {p.efficiency?.enabled ? (
                <Lever
                    label={labels.efficiency.label}
                    value={\`\${efficiencyPct}%\`}
                    hint={\`Recovers a share of the measured \${(f.reducibleShare * 100).toFixed(0)}% reducible base, phased in over a quarter.\`}
                    active={efficiencyPct !== p.efficiency.default}
                >
                    <input
                        type="range"
                        className="lever"
                        min={p.efficiency.min}
                        max={p.efficiency.max}
                        step={p.efficiency.step}
                        value={efficiencyPct}
                        onChange={(e) => setEfficiency(e.target.value)}
                    />
                </Lever>
            ) : null}

            {p.step?.enabled ? (
                <>
                    <Lever
                        label={labels.step.label}
                        value={stepMonth === null ? '—' : \`+\${stepMonth} mo\`}
                        hint={labels.step.hint}
                        active={stepMonth !== (p.step.defaultMonth ?? null)}
                    >
                        <Select
                            value={stepMonth === null ? 'none' : String(stepMonth)}
                            onValueChange={setStepMonth}
                        >
                            <SelectTrigger className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">{labels.step.noneLabel}</SelectItem>
                                {p.step.monthChoices.map((m) => (
                                    <SelectItem key={m} value={String(m)}>
                                        In {m} months
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Lever>
                    <Lever
                        label={labels.step.sizeLabel}
                        value={formatValue(stepSize)}
                        hint={labels.step.sizeHint}
                        active={stepSize !== p.step.defaultSize}
                    >
                        <input
                            type="range"
                            className="lever"
                            min={p.step.minSize}
                            max={p.step.maxSize}
                            step={p.step.sizeStep}
                            value={stepSize}
                            onChange={(e) => setStepSize(e.target.value)}
                        />
                    </Lever>
                </>
            ) : null}

            <p className="border-t border-border pt-3 text-[11px] leading-snug text-muted-foreground">
                Defaults are seeded from the bound actuals: the growth rate is fitted
                to history and the seasonal shape is derived from it.
            </p>
        </aside>
    );
}
`,
    },
    {
        filename: 'src/components/OutcomeStrip.jsx',
        contents: `import { Loader2 } from 'lucide-react';
import { useForecast, monthAt } from './ForecastProvider';
import { labels, formatValue } from '../template';

function Cell({ label, value, sub, tone }) {
    const toneClass =
        tone === 'warn' ? 'text-amber-500' : tone === 'accent' ? 'text-primary' : '';
    return (
        <div className="px-5 py-4 first:pl-0 last:pr-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                {label}
            </p>
            <p className={\`mt-1.5 text-4xl font-light tabular-nums tracking-tight \${toneClass}\`}>
                {value}
            </p>
            {sub ? <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p> : null}
        </div>
    );
}

function CapacityCells({ f }) {
    const full = f.scenario.fullMonth;
    const baseFull = f.baseline.fullMonth;
    const fullDelta = full !== null && baseFull !== null ? full - baseFull : null;
    const stepNeeded = f.scenarioNoStep.thresholdMonth;
    const baseNeeded = f.baseline.thresholdMonth;
    const deferral =
        stepNeeded !== null && baseNeeded !== null ? stepNeeded - baseNeeded : null;

    return (
        <>
            <Cell
                label="Months to Limit"
                value={full === null ? '>30' : String(full)}
                sub={
                    fullDelta !== null && fullDelta !== 0
                        ? \`\${fullDelta > 0 ? '+' : ''}\${fullDelta} vs baseline\`
                        : 'vs baseline: unchanged'
                }
                tone={full !== null && full < 12 ? 'warn' : full === null || full >= 18 ? 'accent' : undefined}
            />
            <Cell
                label={\`\${labels.step.label} by\`}
                value={stepNeeded === null ? 'Beyond plan' : monthAt(stepNeeded, f.lastActual?.month)}
                sub={
                    deferral !== null && deferral !== 0
                        ? \`deferred \${deferral} months by this scenario\`
                        : 'first 90% crossing without the planned step'
                }
                tone={deferral !== null && deferral > 0 ? 'accent' : undefined}
            />
            <Cell
                label="Recovered / Yr"
                value={formatValue(f.reclaimedPerYr)}
                sub={\`\${labels.efficiency.label.toLowerCase()} at \${f.levers.efficiencyPct}%\`}
                tone={f.levers.efficiencyPct > 0 ? 'accent' : undefined}
            />
            <Cell
                label="Reducible Base"
                value={\`\${formatValue(f.reduciblePerYr)}/yr\`}
                sub={\`\${(f.reducibleShare * 100).toFixed(1)}% of \${labels.valueNoun} is reducible\`}
            />
        </>
    );
}

function TrajectoryCells({ f }) {
    const runRate = f.scenario.points[11]?.value;
    const baseRate = f.baseline.points[11]?.value;
    const delta = runRate !== undefined && baseRate ? ((runRate - baseRate) / baseRate) * 100 : null;
    const stepAdds = f.twelveMonthTotals.scenario - f.twelveMonthTotals.noStep;
    const hasStep = f.levers.stepMonth !== null;

    return (
        <>
            <Cell
                label="Run Rate, +12 Mo"
                value={runRate === undefined ? '—' : formatValue(runRate)}
                sub={
                    delta !== null && Math.abs(delta) >= 0.5
                        ? \`\${delta > 0 ? '+' : ''}\${delta.toFixed(0)}% vs baseline\`
                        : 'vs baseline: unchanged'
                }
                tone={delta !== null && delta > 0 ? 'accent' : delta !== null && delta < 0 ? 'warn' : undefined}
            />
            <Cell
                label="Next 12 Months"
                value={formatValue(f.twelveMonthTotals.scenario)}
                sub={\`baseline \${formatValue(f.twelveMonthTotals.baseline)}\`}
                tone={f.twelveMonthTotals.scenario > f.twelveMonthTotals.baseline ? 'accent' : undefined}
            />
            <Cell
                label={\`\${labels.step.label} adds\`}
                value={hasStep ? formatValue(stepAdds) : '—'}
                sub={hasStep ? 'over the next 12 months' : labels.step.noneLabel.toLowerCase()}
                tone={hasStep && stepAdds > 0 ? 'accent' : undefined}
            />
            <Cell
                label="Latest Month"
                value={f.lastActual ? formatValue(f.lastActual.value) : '—'}
                sub={\`fitted growth \${f.autoGrowth.toFixed(1)}%/mo\`}
            />
        </>
    );
}

export default function OutcomeStrip({ className = '' }) {
    const f = useForecast();

    if (f.loading) {
        return (
            <div className={\`\${className} flex h-28 items-center justify-center border-y border-border\`}>
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        );
    }
    if (f.error) {
        return <p className={\`\${className} text-sm text-destructive\`}>{f.error.message}</p>;
    }

    return (
        <section
            className={\`\${className} grid grid-cols-2 divide-y divide-border border-y border-border md:grid-cols-4 md:divide-x md:divide-y-0\`}
        >
            {f.mode === 'capacity' ? <CapacityCells f={f} /> : <TrajectoryCells f={f} />}
        </section>
    );
}
`,
    },
    {
        filename: 'src/components/TrajectoryChart.jsx',
        contents: `import { useMemo } from 'react';
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Legend,
    Line,
    ReferenceArea,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { format as formatDateFns, parseISO } from 'date-fns';
import { CHART_COLORS } from '@/lib/theme';
import { ChartTooltipSurface } from '@/lib/floating';
import { useForecast } from './ForecastProvider';
import { labels, formatValue } from '../template';

function tick(month, variant) {
    return formatDateFns(parseISO(month), variant === 'axis' ? "MMM ''yy" : 'MMM yyyy');
}

export default function TrajectoryChart({ className = '' }) {
    const f = useForecast();
    const capacity = f.mode === 'capacity';

    const rows = useMemo(() => {
        if (f.loading || f.error) return [];
        const hist = f.history.map((r) => ({
            month: r.month,
            actual: r.value,
            ...(capacity ? { ceiling: r.ceiling, threshold: r.ceiling * 0.9 } : {}),
        }));
        const future = f.scenario.points.slice(0, f.chartHorizon).map((pt, i) => ({
            month: pt.month,
            scenario: pt.value,
            ...(capacity
                ? { ceiling: pt.ceiling, threshold: pt.ceiling * 0.9 }
                : { baseline: f.baseline.points[i]?.value }),
        }));
        // bridge the projection lines to the last actual so nothing gaps
        if (hist.length && future.length) {
            const last = hist[hist.length - 1];
            last.scenario = last.actual;
            if (!capacity) last.baseline = last.actual;
        }
        return [...hist, ...future];
    }, [f.loading, f.error, f.history, f.scenario, f.baseline, f.chartHorizon, capacity]);

    const todayMonth = f.lastActual?.month;
    const endMonth = rows.length ? rows[rows.length - 1].month : null;
    const names = {
        actual: \`\${labels.seriesLabel} (actual)\`,
        scenario: 'Scenario',
        baseline: 'Baseline',
        ceiling: labels.ceilingLabel ?? 'Ceiling',
        threshold: 'Planning threshold (90%)',
    };

    return (
        <section className={\`\${className} min-w-0\`} {...f.lineage}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                    {labels.chart.title}
                </h2>
                <p className="max-w-md text-right text-[11px] text-muted-foreground">
                    {labels.chart.description}
                </p>
            </div>
            <div className="h-[400px]">
                {f.loading ? (
                    <div className="flex h-full items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : f.error ? (
                    <p className="text-sm text-destructive">{f.error.message}</p>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                            <defs>
                                <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.22} />
                                    <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            {todayMonth && endMonth ? (
                                <ReferenceArea
                                    x1={todayMonth}
                                    x2={endMonth}
                                    fill="var(--muted)"
                                    fillOpacity={0.22}
                                />
                            ) : null}
                            <XAxis
                                dataKey="month"
                                stroke="var(--muted-foreground)"
                                tickLine={false}
                                interval={5}
                                tickFormatter={(v) => tick(v, 'axis')}
                            />
                            <YAxis
                                stroke="var(--muted-foreground)"
                                tickLine={false}
                                tickFormatter={(v) => formatValue(v)}
                            />
                            <Tooltip
                                cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
                                content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;
                                    const r = payload[0].payload;
                                    const projected = r.actual == null;
                                    const value = r.actual ?? r.scenario;
                                    return (
                                        <ChartTooltipSurface>
                                            <div className="mb-1 font-semibold">
                                                {tick(r.month, 'cell')}
                                                {projected ? ' · projected' : ''}
                                            </div>
                                            <div className="space-y-0.5 font-mono text-sm tabular-nums">
                                                <div>
                                                    {labels.seriesLabel}: {formatValue(value ?? 0)}
                                                </div>
                                                {capacity && r.ceiling ? (
                                                    <>
                                                        <div>
                                                            {names.ceiling}: {formatValue(r.ceiling)}
                                                        </div>
                                                        <div>
                                                            Utilization:{' '}
                                                            {Math.round(((value ?? 0) / r.ceiling) * 100)}%
                                                        </div>
                                                    </>
                                                ) : null}
                                                {!capacity && projected && r.baseline != null ? (
                                                    <div>Baseline: {formatValue(r.baseline)}</div>
                                                ) : null}
                                            </div>
                                        </ChartTooltipSurface>
                                    );
                                }}
                            />
                            <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => names[v] ?? v} />
                            <Area
                                dataKey="actual"
                                type="monotone"
                                stroke={CHART_COLORS[0]}
                                strokeWidth={2}
                                fill="url(#actualFill)"
                                dot={false}
                            />
                            <Line
                                dataKey="scenario"
                                type="monotone"
                                stroke={CHART_COLORS[1]}
                                strokeWidth={2.5}
                                strokeDasharray="7 4"
                                dot={false}
                            />
                            {capacity ? (
                                <>
                                    <Line
                                        dataKey="ceiling"
                                        type="stepAfter"
                                        stroke="var(--foreground)"
                                        strokeWidth={1.5}
                                        dot={false}
                                    />
                                    <Line
                                        dataKey="threshold"
                                        type="stepAfter"
                                        stroke={CHART_COLORS[3]}
                                        strokeDasharray="4 4"
                                        strokeWidth={1.25}
                                        dot={false}
                                    />
                                </>
                            ) : (
                                <Line
                                    dataKey="baseline"
                                    type="monotone"
                                    stroke="var(--muted-foreground)"
                                    strokeDasharray="2 5"
                                    strokeWidth={1.25}
                                    dot={false}
                                />
                            )}
                            {todayMonth ? (
                                <ReferenceLine
                                    x={todayMonth}
                                    stroke="var(--muted-foreground)"
                                    strokeDasharray="3 3"
                                    label={{
                                        value: 'today',
                                        position: 'insideTopLeft',
                                        fill: 'var(--muted-foreground)',
                                        fontSize: 10,
                                    }}
                                />
                            ) : null}
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </div>
        </section>
    );
}
`,
    },
    {
        filename: 'src/components/PlanCard.jsx',
        contents: `import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Copy } from 'lucide-react';
import { useForecast, monthAt } from './ForecastProvider';
import { labels, bindings, formatValue } from '../template';

export default function PlanCard({ className = '' }) {
    const f = useForecast();
    const [copied, setCopied] = useState(false);
    if (f.loading || f.error) return null;

    const { growthPct, efficiencyPct, stepMonth, stepSize } = f.levers;
    const lines = [
        \`\${labels.seriesLabel} plan · drafted against the \${monthAt(0, f.lastActual?.month)} close\`,
        \`- Growth: \${growthPct.toFixed(1)}% monthly (fitted rate \${f.autoGrowth.toFixed(1)}%), seasonal shape from actuals\`,
    ];
    if (efficiencyPct > 0) {
        lines.push(
            \`- \${labels.efficiency.label}: \${efficiencyPct}% of the \${(f.reducibleShare * 100).toFixed(1)}% reducible base, recovering \${formatValue(f.reclaimedPerYr)}/yr\`,
        );
    }
    lines.push(
        \`- \${labels.step.label}: \${
            stepMonth === null
                ? 'none planned'
                : \`\${formatValue(stepSize)} landing \${monthAt(stepMonth, f.lastActual?.month)}\`
        }\`,
    );
    if (f.mode === 'capacity') {
        const full = f.scenario.fullMonth;
        const needed = f.scenarioNoStep.thresholdMonth;
        lines.push(
            \`- Outcome: the \${(labels.ceilingLabel ?? 'ceiling').toLowerCase()} is reached \${full === null ? 'beyond the 30-month horizon' : \`in \${full} months (\${monthAt(full, f.lastActual?.month)})\`}\`,
            \`- Without the planned step, 90% is crossed \${needed === null ? 'beyond the horizon' : \`in \${needed} months (\${monthAt(needed, f.lastActual?.month)})\`}\`,
        );
    } else {
        const delta = f.twelveMonthTotals.baseline
            ? ((f.twelveMonthTotals.scenario - f.twelveMonthTotals.baseline) /
                  f.twelveMonthTotals.baseline) *
              100
            : 0;
        const runRate = f.scenario.points[11]?.value;
        lines.push(
            \`- Outcome: \${formatValue(f.twelveMonthTotals.scenario)} of \${labels.valueNoun} over the next 12 months (\${delta >= 0 ? '+' : ''}\${delta.toFixed(1)}% vs baseline)\`,
            \`- Run rate \${runRate === undefined ? '—' : formatValue(runRate)}/mo by \${monthAt(12, f.lastActual?.month)}\`,
        );
    }
    lines.push(\`Source: governed semantic layer (\${bindings.history.explore}); scenario maths runs in-app.\`);

    const copyPlan = () => {
        navigator.clipboard.writeText(lines.join('\\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <section className={\`\${className} border border-border p-6\`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                        The plan, in writing
                    </h2>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                        The scenario as a hand-off: paste it into a request or a doc and
                        the loop from what-if to decision is closed.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={copyPlan}>
                    {copied ? (
                        <Check className="mr-1 h-4 w-4 text-primary" />
                    ) : (
                        <Copy className="mr-1 h-4 w-4" />
                    )}
                    {copied ? 'Copied' : 'Copy plan'}
                </Button>
            </div>
            <ul className="mt-4 space-y-2 text-sm">
                {lines.slice(1, -1).map((l) => (
                    <li key={l} className="flex gap-3">
                        <span className="mt-2 inline-block h-px w-4 shrink-0 bg-primary" />
                        <span>{l.replace(/^- /, '')}</span>
                    </li>
                ))}
            </ul>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {lines[lines.length - 1]}
            </p>
        </section>
    );
}
`,
    },
];
