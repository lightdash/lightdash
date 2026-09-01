// GENERATED from the reference implementation at
// lightdash-demo-data-gardening/dbt-bigquery/lightdash/apps/kpi-scorecard
// (fresh-authored, no external lineage). Only authored files are included;
// scaffold files (src/lib, src/components/ui, css, screenshotHandler) come
// from the sandbox image. Regenerate by re-running the porting script
// against the reference app rather than editing by hand.

import { type TemplateSourceFile } from './forecasterSource.generated';

export const SCORECARD_SOURCE_FILES: TemplateSourceFile[] = [
    {
        filename: 'template.json',
        contents: `{
    "templateVersion": 1,
    "template": {
        "id": "scorecard",
        "name": "KPI Scorecard",
        "category": "Reporting",
        "description": "A tiled scorecard of your key metrics: period total, comparison to the previous period, a sparkline, and an optional target per tile.",
        "agentInstructionsFile": "AGENTS.md"
    },
    "bindings": {
        "tiles": [
            {
                "key": "revenue",
                "explore": "orders",
                "metric": "total_order_amount",
                "timeDimension": "order_date",
                "label": "Revenue",
                "unit": {
                    "kind": "currency",
                    "symbol": "$"
                },
                "target": null
            },
            {
                "key": "order_size",
                "explore": "orders",
                "metric": "average_order_size",
                "timeDimension": "order_date",
                "label": "Average order size",
                "unit": {
                    "kind": "currency",
                    "symbol": "$"
                },
                "target": null
            },
            {
                "key": "shipping",
                "explore": "orders",
                "metric": "total_shipping_revenue",
                "timeDimension": "order_date",
                "label": "Shipping revenue",
                "unit": {
                    "kind": "currency",
                    "symbol": "$"
                },
                "target": null
            },
            {
                "key": "customers",
                "explore": "customers",
                "metric": "unique_customer_count",
                "timeDimension": "created",
                "label": "New customers",
                "unit": {
                    "kind": "number"
                },
                "target": null
            }
        ]
    },
    "parameters": {
        "period": {
            "enabled": true,
            "default": 90,
            "options": [
                30,
                90,
                365
            ]
        },
        "comparison": {
            "enabled": true,
            "default": "previous_period",
            "options": [
                "previous_period",
                "none"
            ]
        },
        "sparklines": {
            "enabled": true
        }
    },
    "labels": {
        "eyebrow": "Finance",
        "title": "KPI",
        "titleAccent": "Scorecard",
        "tagline": "The numbers that matter, on one page: period totals against the previous period, with the shape of the trend behind each.",
        "periodLabel": "Period",
        "comparisonLabel": "Compare to",
        "comparisonOptions": {
            "previous_period": "Previous period",
            "none": "No comparison"
        }
    },
    "theme": {
        "mode": "dark",
        "vars": {
            "--background": "#121417",
            "--foreground": "#eef0f3",
            "--card": "#191c21",
            "--card-foreground": "#eef0f3",
            "--popover": "#191c21",
            "--popover-foreground": "#eef0f3",
            "--primary": "#7fb7ff",
            "--primary-foreground": "#0b1420",
            "--secondary": "#22272f",
            "--secondary-foreground": "#eef0f3",
            "--muted": "#20242b",
            "--muted-foreground": "#9aa3b2",
            "--accent": "#22272f",
            "--accent-foreground": "#eef0f3",
            "--border": "#2b313b",
            "--input": "#2b313b",
            "--ring": "#7fb7ff",
            "--chart-1": "#7fb7ff"
        }
    }
}
`,
    },
    {
        filename: 'src/App.jsx',
        contents: `import { ErrorBoundary } from '@/lib/ErrorBoundary';
import { ScorecardProvider } from './components/ScorecardProvider';
import ControlsBar from './components/ControlsBar';
import ScorecardTile from './components/ScorecardTile';
import { bindings, labels, shellClass } from './template';
import './app.css';

function App() {
    return (
        <ScorecardProvider>
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

                    <ErrorBoundary>
                        <ControlsBar className="rise rise-2 mt-6" />
                    </ErrorBoundary>

                    <section className="rise rise-3 tile-grid mt-2">
                        {bindings.tiles.map((tile) => (
                            <ErrorBoundary key={tile.key}>
                                <ScorecardTile tile={tile} />
                            </ErrorBoundary>
                        ))}
                    </section>

                    <footer className="mt-10 border-t border-border pt-4 font-mono text-[11px] text-muted-foreground">
                        Every tile is a governed semantic-layer metric · period totals are
                        computed by the warehouse, not summed from rows · view state lives in
                        the URL, so any view is shareable as a link
                    </footer>
                </div>
            </div>
        </ScorecardProvider>
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

/* Scorecard tiles: a ruled grid, hairlines rather than cards. */
.tile-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    border-top: 1px solid var(--border);
}
@media (min-width: 1024px) {
    .tile-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
    }
}
.tile {
    padding: 20px 20px 18px;
    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border);
    min-width: 0;
}
.tile:nth-child(2n) {
    border-right: none;
}
@media (min-width: 1024px) {
    .tile:nth-child(2n) {
        border-right: 1px solid var(--border);
    }
    .tile:nth-child(4n) {
        border-right: none;
    }
}

/* Target progress, a hairline track in the theme's accent. */
.target-track {
    margin-top: 6px;
    height: 3px;
    background: color-mix(in oklab, var(--border) 70%, transparent);
}
.target-fill {
    height: 100%;
    background: var(--primary);
    transition: width 0.3s ease;
}
`,
    },
    {
        filename: 'src/template.js',
        contents: `// Template runtime: loads template.json, validates the tiles contract, and
// exposes accessors so no component hardcodes an explore, field ID, label, or
// brand color. Instantiating this template is a template.json edit — add,
// remove, or retarget tiles; components stay as authored.
import manifest from '../template.json';

function fail(message) {
    throw new Error(\`[kpi-scorecard template] \${message} — check template.json\`);
}

if (manifest.templateVersion !== 1) fail('unsupported templateVersion');
const tiles = manifest?.bindings?.tiles;
if (!Array.isArray(tiles) || tiles.length === 0) fail('bindings.tiles must be a non-empty array');
tiles.forEach((tile, i) => {
    for (const key of ['key', 'explore', 'metric', 'timeDimension', 'label']) {
        if (typeof tile[key] !== 'string' || !tile[key]) {
            fail(\`bindings.tiles[\${i}].\${key} is required\`);
        }
    }
    if (tile.target !== null && tile.target !== undefined && !Number.isFinite(tile.target)) {
        fail(\`bindings.tiles[\${i}].target must be a number or null\`);
    }
});
const keys = new Set(tiles.map((t) => t.key));
if (keys.size !== tiles.length) fail('bindings.tiles keys must be unique');

export const template = manifest.template;
export const bindings = manifest.bindings;
export const parameters = manifest.parameters;
export const labels = manifest.labels;

// Tailwind shell class for the app root, from the theme slot's mode.
export const shellClass = (manifest.theme?.mode ?? 'dark') === 'light' ? '' : 'dark';

// Compact display of a tile value in its declared unit.
export function formatUnit(v, unit) {
    if (!Number.isFinite(v)) return '—';
    const kind = unit?.kind ?? 'number';
    if (kind === 'percent') return \`\${v.toFixed(1)}%\`;
    const sign = v < 0 ? '-' : '';
    const abs = Math.abs(v);
    const prefix = kind === 'currency' ? (unit.symbol ?? '$') : '';
    if (abs >= 1_000_000) return \`\${sign}\${prefix}\${(abs / 1_000_000).toFixed(1)}M\`;
    if (abs >= 10_000) return \`\${sign}\${prefix}\${Math.round(abs / 1000)}K\`;
    if (abs >= 1_000) return \`\${sign}\${prefix}\${(abs / 1000).toFixed(1)}K\`;
    if (kind === 'currency') return \`\${sign}\${prefix}\${abs.toFixed(abs < 100 ? 2 : 0)}\`;
    return \`\${sign}\${Number.isInteger(abs) ? abs : abs.toFixed(1)}\`;
}

// Applies the theme slot: raw CSS custom properties on <html>, where inline
// styles win over both the :root and .dark stylesheet values and cascade into
// Radix portals rendered under <body>.
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
        filename: 'src/components/ScorecardProvider.jsx',
        contents: `import { createContext, useContext, useMemo } from 'react';
import { useUrlState } from '@lightdash/query-sdk';
import { parameters } from '../template';

const ScorecardContext = createContext(null);

// View state only: which period and comparison the scorecard shows. Both
// live in the URL so any view is a shareable link. Seeded values come from a
// user-editable URL, so they are validated against the manifest's options.
export function ScorecardProvider({ children }) {
    const p = parameters;
    const periodOptions = p.period?.options ?? [90];
    const comparisonOptions = p.comparison?.options ?? ['previous_period'];

    const [periodRaw, setPeriod] = useUrlState('period', String(p.period?.default ?? periodOptions[0]));
    const [comparisonRaw, setComparison] = useUrlState('compare', p.comparison?.default ?? comparisonOptions[0]);

    const value = useMemo(() => {
        const periodParsed = Number(periodRaw);
        const period = periodOptions.includes(periodParsed) ? periodParsed : (p.period?.default ?? periodOptions[0]);
        const comparison = comparisonOptions.includes(comparisonRaw)
            ? comparisonRaw
            : (p.comparison?.default ?? comparisonOptions[0]);
        return {
            period,
            comparison,
            periodOptions,
            comparisonOptions,
            periodEnabled: p.period?.enabled !== false,
            comparisonEnabled: p.comparison?.enabled !== false,
            sparklinesEnabled: p.sparklines?.enabled !== false,
            setPeriod: (v) => setPeriod(String(v)),
            setComparison,
        };
    }, [periodRaw, comparisonRaw, setPeriod, setComparison, p, periodOptions, comparisonOptions]);

    return <ScorecardContext.Provider value={value}>{children}</ScorecardContext.Provider>;
}

export function useScorecard() {
    return useContext(ScorecardContext);
}
`,
    },
    {
        filename: 'src/components/ScorecardTile.jsx',
        contents: `import { useMemo } from 'react';
import { query, useLightdash } from '@lightdash/query-sdk';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { Loader2 } from 'lucide-react';
import { CHART_COLORS } from '@/lib/theme';
import { useScorecard } from './ScorecardProvider';
import { formatUnit } from '../template';

// One tile = one bound metric. Three governed queries: the period total, the
// previous period's total (for the delta), and a day-grain series for the
// sparkline. Aggregates are queried without a time dimension so averages,
// rates, and distinct counts are computed by the warehouse over the window
// rather than mis-summed from daily rows.
export default function ScorecardTile({ tile }) {
    const { period, comparison, sparklinesEnabled } = useScorecard();

    const { currentQuery, previousQuery, seriesQuery } = useMemo(() => {
        const current = query(tile.explore)
            .label(\`\${tile.label} · current period\`)
            .metrics([tile.metric])
            .filters([
                { field: tile.timeDimension, operator: 'inThePast', value: period, unit: 'days' },
            ])
            .limit(1);
        const previous =
            comparison === 'none'
                ? current
                : query(tile.explore)
                      .label(\`\${tile.label} · previous period\`)
                      .metrics([tile.metric])
                      .filters([
                          { field: tile.timeDimension, operator: 'inThePast', value: period * 2, unit: 'days' },
                          { field: tile.timeDimension, operator: 'notInThePast', value: period, unit: 'days' },
                      ])
                      .limit(1);
        const series = query(tile.explore)
            .label(\`\${tile.label} · daily\`)
            .dimensions([\`\${tile.timeDimension}_day\`])
            .metrics([tile.metric])
            .filters([
                { field: tile.timeDimension, operator: 'inThePast', value: period, unit: 'days' },
            ])
            .sorts([{ field: \`\${tile.timeDimension}_day\`, direction: 'asc' }])
            .limit(400);
        return { currentQuery: current, previousQuery: previous, seriesQuery: series };
    }, [tile, period, comparison]);

    const current = useLightdash(currentQuery);
    const previous = useLightdash(previousQuery);
    const series = useLightdash(seriesQuery);

    const loading = current.loading || previous.loading || series.loading;
    const error = current.error || previous.error || series.error;
    const value = current.data[0]?.[tile.metric] ?? null;
    const prior = comparison === 'none' ? null : (previous.data[0]?.[tile.metric] ?? null);
    const delta =
        value !== null && prior !== null && prior !== 0 ? ((value - prior) / prior) * 100 : null;
    const points = series.data.map((r) => ({ v: r[tile.metric] ?? 0 }));
    const targetPct =
        tile.target && value !== null ? Math.max(0, Math.min(100, (value / tile.target) * 100)) : null;

    return (
        <div className="tile" {...current.lineage}>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                {tile.label}
            </p>
            {loading ? (
                <div className="flex h-24 items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
            ) : error ? (
                <p className="mt-2 text-xs text-destructive">{error.message}</p>
            ) : (
                <>
                    <div className="mt-1.5 flex items-baseline gap-3">
                        <p className="text-4xl font-light tabular-nums tracking-tight">
                            {formatUnit(value, tile.unit)}
                        </p>
                        {delta !== null ? (
                            <span
                                className={\`font-mono text-[11px] tabular-nums \${
                                    delta >= 0 ? 'text-primary' : 'text-amber-500'
                                }\`}
                            >
                                {delta >= 0 ? '+' : ''}
                                {delta.toFixed(1)}%
                            </span>
                        ) : null}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                        {prior !== null
                            ? \`previous \${period}d: \${formatUnit(prior, tile.unit)}\`
                            : \`last \${period} days\`}
                    </p>
                    {targetPct !== null ? (
                        <div className="mt-3">
                            <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                <span>Target {formatUnit(tile.target, tile.unit)}</span>
                                <span>{targetPct.toFixed(0)}%</span>
                            </div>
                            <div className="target-track">
                                <div className="target-fill" style={{ width: \`\${targetPct}%\` }} />
                            </div>
                        </div>
                    ) : null}
                    {sparklinesEnabled && points.length > 1 ? (
                        <div className="mt-3 h-12">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id={\`spark-\${tile.key}\`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.3} />
                                            <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <Area
                                        dataKey="v"
                                        type="monotone"
                                        stroke={CHART_COLORS[0]}
                                        strokeWidth={1.5}
                                        fill={\`url(#spark-\${tile.key})\`}
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : null}
                </>
            )}
        </div>
    );
}
`,
    },
    {
        filename: 'src/components/ControlsBar.jsx',
        contents: `import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useScorecard } from './ScorecardProvider';
import { labels } from '../template';

function Control({ label, children }) {
    return (
        <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                {label}
            </span>
            {children}
        </div>
    );
}

// View controls render only for parameters the template enables — a
// disabled parameter is simply not offered, which is how an instantiation
// narrows what its users can change.
export default function ControlsBar({ className = '' }) {
    const s = useScorecard();
    if (!s.periodEnabled && !s.comparisonEnabled) return null;
    return (
        <div className={\`\${className} flex flex-wrap items-center gap-8 border-b border-border pb-4\`}>
            {s.periodEnabled ? (
                <Control label={labels.periodLabel}>
                    <Select value={String(s.period)} onValueChange={s.setPeriod}>
                        <SelectTrigger className="h-8 w-40">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {s.periodOptions.map((d) => (
                                <SelectItem key={d} value={String(d)}>
                                    Last {d} days
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Control>
            ) : null}
            {s.comparisonEnabled ? (
                <Control label={labels.comparisonLabel}>
                    <Select value={s.comparison} onValueChange={s.setComparison}>
                        <SelectTrigger className="h-8 w-44">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {s.comparisonOptions.map((c) => (
                                <SelectItem key={c} value={c}>
                                    {labels.comparisonOptions?.[c] ?? c}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Control>
            ) : null}
        </div>
    );
}
`,
    },
];
