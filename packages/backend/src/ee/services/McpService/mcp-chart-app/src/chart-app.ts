import type { DataAppVizContext } from '@lightdash/common';
// Deep imports bypass @lightdash/common's barrel, which transitively pulls
// in pegjs/postcss and breaks the browser bundle (path.isAbsolute externalized).
import assertUnreachable from '@lightdash/common/src/utils/assertUnreachable';
import {
    formatCartesianTooltipRow,
    formatColorIndicator,
    formatTooltipHeader,
    formatTooltipRow,
    formatTooltipValue,
} from '@lightdash/common/src/visualizations/helpers/styles/tooltipStyles';
import {
    App,
    applyDocumentTheme,
    applyHostStyleVariables,
    type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps';
import * as echarts from 'echarts';
import { loadMcpCustomChartFrameHtml } from '../../mcpCustomChartFrameHtml';
import {
    getCustomChartFrameHandshake,
    getCustomChartFrameUrl,
    getCustomChartRenderDeadlineAction,
    getCustomChartThemeMessage,
    handleCustomChartFrameMessage,
    INITIAL_CUSTOM_CHART_RENDER_READINESS,
    updateCustomChartRenderReadiness,
    type CustomChartColorScheme,
    type CustomChartHostMessage,
} from '../../mcpCustomChartFrameProtocol';
import { lightdashTheme } from './lightdash-theme';

const card = document.getElementById('card') as HTMLDivElement;
const chartContainer = document.getElementById('chart') as HTMLDivElement;
const resultContainer = document.getElementById(
    'result-container',
) as HTMLDivElement;
const customChartContainer = document.getElementById(
    'custom-chart',
) as HTMLDivElement;
const cardFooter = document.getElementById('card-footer') as HTMLDivElement;
const cardCaption = document.getElementById('card-caption') as HTMLSpanElement;
const expandButton = document.getElementById('expand-btn') as HTMLButtonElement;
const exploreButton = document.getElementById(
    'explore-btn',
) as HTMLButtonElement;

let chart: echarts.ECharts | null = null;
let chartColorScheme: CustomChartColorScheme | null = null;
let lastChartOption: echarts.EChartsOption | null = null;

// ---------------------------------------------------------------------------
// Tooltip formatter helpers (client-side, functions can't be serialized)
// ---------------------------------------------------------------------------

/** Extract color string from ECharts marker HTML or default. */
function extractColor(
    param: echarts.DefaultLabelFormatterCallbackParams,
): string {
    const marker = (param as { marker?: string }).marker ?? '';
    const match = marker.match(/background-color:([^;"]+)/);
    return match ? match[1] : ((param.color as string) ?? '#999');
}

function formatValue(v: unknown): string {
    if (v == null) return '-';
    return String(v);
}

// NOTE: below you can see tooltip formatters. These could have been imported from @lightdash/common, but that would require fetching a lot more information.

/**
 * Cartesian tooltip formatter (bar, line, scatter, etc.)
 * Applied client-side because functions can't be serialized to JSON.
 */
function cartesianTooltipFormatter(
    params:
        | echarts.DefaultLabelFormatterCallbackParams
        | echarts.DefaultLabelFormatterCallbackParams[],
): string {
    const list = Array.isArray(params) ? params : [params];
    if (list.length === 0) return '';

    // Header from axis value (these props exist at runtime but aren't in the TS types)
    const first = list[0] as {
        axisValueLabel?: string;
        axisValue?: unknown;
        name?: string;
    };
    const header =
        first.axisValueLabel ?? formatValue(first.axisValue ?? first.name);

    let html = formatTooltipHeader(escapeHtml(String(header ?? '')));

    for (const p of list) {
        const color = extractColor(p);
        const name = p.seriesName ?? '';
        const value = Array.isArray(p.value)
            ? formatValue(p.value[p.encode?.y?.[0] ?? 1])
            : formatValue(
                  typeof p.value === 'object' && p.value !== null
                      ? (p.value as Record<string, unknown>)[
                            p.dimensionNames?.[p.encode?.y?.[0] ?? 1] ?? ''
                        ]
                      : p.value,
              );

        html += formatCartesianTooltipRow(
            formatColorIndicator(color),
            escapeHtml(name),
            formatTooltipValue(escapeHtml(value)),
        );
    }
    return html;
}

/**
 * Pie / funnel tooltip formatter
 */
function itemTooltipFormatter(
    params:
        | echarts.DefaultLabelFormatterCallbackParams
        | echarts.DefaultLabelFormatterCallbackParams[],
): string {
    const p = Array.isArray(params) ? params[0] : params;
    if (!p) return '';

    const color = extractColor(p);
    const name = p.name ?? '';
    const value = formatValue(
        Array.isArray(p.value)
            ? p.value[1]
            : typeof p.value === 'object' && p.value !== null
              ? ((p.value as Record<string, unknown>)[
                    Object.keys(p.value)[1] ?? ''
                ] ?? p.value)
              : p.value,
    );
    const percent = (p as { percent?: number }).percent;
    const display =
        percent != null ? `${percent.toFixed(1)}% \u2014 ${value}` : value;

    return formatTooltipRow(
        formatColorIndicator(color),
        escapeHtml(name),
        formatTooltipValue(escapeHtml(display)),
    );
}

const colorProbe = document.createElement('span');
colorProbe.hidden = true;
document.body.appendChild(colorProbe);

/** Resolves a CSS colour (var(), light-dark()) to a value the canvas renderer can draw. */
function resolveCssColor(value: string): string {
    colorProbe.style.color = value;
    const resolved = colorProbe.style.color
        ? getComputedStyle(colorProbe).color
        : value;
    colorProbe.style.color = '';
    return resolved;
}

function resolveCssVariables<T>(value: T): T {
    if (typeof value === 'string') {
        return (value.startsWith('var(') ? resolveCssColor(value) : value) as T;
    }
    if (Array.isArray(value)) return value.map(resolveCssVariables) as T;
    if (isRecord(value)) {
        return Object.fromEntries(
            Object.entries(value).map(([key, v]) => [
                key,
                resolveCssVariables(v),
            ]),
        ) as T;
    }
    return value;
}

function initChart(): echarts.ECharts {
    if (chart) {
        chart.dispose();
    }
    chartColorScheme = getHostColorScheme();
    // Re-registered on every init so the theme picks up the host's current colours
    echarts.registerTheme('lightdash', resolveCssVariables(lightdashTheme));
    chart = echarts.init(chartContainer, 'lightdash');
    return chart;
}

function renderChart(echartsOption: echarts.EChartsOption): void {
    chartContainer.style.display = 'block';
    resultContainer.style.display = 'none';

    const instance =
        chart && chartColorScheme === getHostColorScheme()
            ? chart
            : initChart();

    // Inject client-side tooltip formatter (can't be serialized in JSON)
    const tooltip = (echartsOption.tooltip ?? {}) as Record<string, unknown>;
    const trigger = tooltip.trigger ?? 'axis';
    const formatter =
        trigger === 'item' ? itemTooltipFormatter : cartesianTooltipFormatter;

    const optionWithFormatter: echarts.EChartsOption = {
        ...echartsOption,
        tooltip: {
            ...tooltip,
            formatter,
            renderMode: 'html',
        },
    };

    lastChartOption = optionWithFormatter;
    setChartOption(instance, optionWithFormatter);
}

function setChartOption(
    instance: echarts.ECharts,
    option: echarts.EChartsOption,
): void {
    // ECharts themes can't style `graphic` text, which the AI chart config uses for axis titles
    const fill = 'var(--app-text-secondary)';
    const graphic = Array.isArray(option.graphic)
        ? option.graphic.map((element: unknown) =>
              isRecord(element) &&
              element.type === 'text' &&
              isRecord(element.style) &&
              element.style.fill === undefined
                  ? { ...element, style: { ...element.style, fill } }
                  : element,
          )
        : option.graphic;
    instance.setOption(
        resolveCssVariables({ ...option, graphic }) as echarts.EChartsOption,
        true,
    );
}

function renderTable(
    rows: Record<string, unknown>[],
    fields: Record<string, { label?: string }>,
): void {
    chartContainer.style.display = 'none';
    resultContainer.style.display = 'block';

    if (rows.length === 0) {
        resultContainer.innerHTML = '<p>No data available.</p>';
        return;
    }

    const fieldIds = Object.keys(rows[0]);
    const headers = fieldIds.map((id) => fields[id]?.label ?? id);

    const headerRow = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
    const bodyRows = rows
        .map(
            (row) =>
                `<tr>${fieldIds
                    .map(
                        (id) => `<td>${escapeHtml(String(row[id] ?? ''))}</td>`,
                    )
                    .join('')}</tr>`,
        )
        .join('');

    resultContainer.innerHTML = `<table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

const EXPAND_ICON =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9"/></svg>';
const COLLAPSE_ICON =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 6.5h-4v-4M2.5 9.5h4v4M9.5 6.5 14 2M6.5 9.5 2 14"/></svg>';

let exploreUrl: string | null = null;

exploreButton.addEventListener('click', async () => {
    if (!exploreUrl) return;
    const { isError } = await app.openLink({ url: exploreUrl });
    if (isError) {
        console.warn('Host denied the request - URL:', exploreUrl);
    }
});

function isFullscreen(): boolean {
    return document.documentElement.dataset.displayMode === 'fullscreen';
}

expandButton.addEventListener('click', async () => {
    try {
        const { mode } = await app.requestDisplayMode({
            mode: isFullscreen() ? 'inline' : 'fullscreen',
        });
        document.documentElement.dataset.displayMode = mode;
    } catch (error) {
        console.warn('Host denied the display mode request', error);
    }
    updateExpandButton();
});

function updateExpandButton(): void {
    const canExpand =
        app.getHostContext()?.availableDisplayModes?.includes('fullscreen') ??
        false;
    expandButton.hidden = !canExpand;
    const fullscreen = isFullscreen();
    const label = fullscreen ? 'Exit full screen' : 'Expand to full screen';
    expandButton.innerHTML = fullscreen ? COLLAPSE_ICON : EXPAND_ICON;
    expandButton.setAttribute('aria-label', label);
    expandButton.title = label;
}

function renderCardFooter({
    rowCount,
    url,
}: {
    rowCount: number | null;
    url: string | null;
}): void {
    card.dataset.framed = 'true';
    exploreUrl = url;
    exploreButton.hidden = url === null;
    cardCaption.textContent =
        rowCount === null
            ? ''
            : `${rowCount.toLocaleString()} ${rowCount === 1 ? 'row' : 'rows'}`;
    updateExpandButton();
    cardFooter.hidden = false;
}

function hideCardFooter(): void {
    exploreUrl = null;
    cardFooter.hidden = true;
}

function applyHostContext(ctx: Partial<McpUiHostContext>): void {
    if (ctx.theme) applyDocumentTheme(ctx.theme);
    if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
    if (ctx.displayMode) {
        document.documentElement.dataset.displayMode = ctx.displayMode;
    }
    if (ctx.safeAreaInsets) {
        const root = document.documentElement.style;
        root.setProperty('--safe-area-top', `${ctx.safeAreaInsets.top}px`);
        root.setProperty('--safe-area-right', `${ctx.safeAreaInsets.right}px`);
        root.setProperty(
            '--safe-area-bottom',
            `${ctx.safeAreaInsets.bottom}px`,
        );
        root.setProperty('--safe-area-left', `${ctx.safeAreaInsets.left}px`);
    }
    updateExpandButton();
}

const app = new App(
    { name: 'Lightdash Chart', version: '1.0.0' },
    { availableDisplayModes: ['inline', 'fullscreen'] },
);

type ChartToolStatus = 'done' | 'running' | 'error' | 'cancelled' | 'expired';

type CustomChartTypeResult = {
    dataAppVizUuid: string;
    version: number;
    vizContext: DataAppVizContext;
    renderArgs: { projectUuid: string; agentUuid?: string };
};

type ChartToolResult = {
    status?: ChartToolStatus;
    echartsOption?: echarts.EChartsOption | null;
    rows?: Record<string, unknown>[];
    fields?: Record<string, { label?: string }>;
    exploreUrl?: string | null;
    customChartType?: CustomChartTypeResult;
};

const CUSTOM_CHART_RENDER_TIMEOUT_MS = 10_000;
// Covers a stalled bundle fetch, and then a frame whose load never fires
const CUSTOM_CHART_LOAD_TIMEOUT_MS = 20_000;

let teardownCustomChart: (() => void) | null = null;
let postToCustomChart: ((message: CustomChartHostMessage) => void) | null =
    null;

function getHostColorScheme(): CustomChartColorScheme {
    const theme =
        app.getHostContext()?.theme ??
        (window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light');
    return theme === 'dark' ? 'dark' : 'light';
}

function clearCustomChart(): void {
    teardownCustomChart?.();
    teardownCustomChart = null;
    postToCustomChart = null;
    customChartContainer.style.display = 'none';
}

/** Runs the chart type bundle in an opaque-origin blob frame and bridges its SDK. */
function renderCustomChart(
    html: string,
    customChartType: CustomChartTypeResult,
    onFailure: () => void,
): void {
    clearCustomChart();
    chartContainer.style.display = 'none';
    resultContainer.style.display = 'none';
    customChartContainer.style.display = 'block';

    const blobUrl = URL.createObjectURL(
        new Blob([html], { type: 'text/html;charset=utf-8' }),
    );
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.title = 'Chart';
    iframe.src = getCustomChartFrameUrl({
        blobUrl,
        projectUuid: customChartType.renderArgs.projectUuid,
        colorScheme: getHostColorScheme(),
    });

    const post = (message: CustomChartHostMessage) =>
        iframe.contentWindow?.postMessage(message, '*');
    let readiness = INITIAL_CUSTOM_CHART_RENDER_READINESS;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const stopDeadline = () => {
        if (timeout !== null) clearTimeout(timeout);
        timeout = null;
        document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    const onDeadline = () => {
        timeout = null;
        const action = getCustomChartRenderDeadlineAction(readiness, {
            documentHidden: document.visibilityState === 'hidden',
        });
        switch (action) {
            case 'keep-chart':
                return;
            case 'wait-for-visible':
                document.addEventListener(
                    'visibilitychange',
                    onVisibilityChange,
                );
                return;
            case 'show-table':
                clearCustomChart();
                onFailure();
                return;
            default:
                assertUnreachable(action, 'Unknown render deadline action');
        }
    };
    const startDeadline = (ms = CUSTOM_CHART_RENDER_TIMEOUT_MS) => {
        stopDeadline();
        timeout = setTimeout(onDeadline, ms);
    };
    const onVisibilityChange = () => {
        if (document.visibilityState !== 'hidden') startDeadline();
    };
    const onLoad = () => {
        getCustomChartFrameHandshake(getHostColorScheme()).forEach(post);
        startDeadline();
    };
    const onMessage = (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow) return;
        readiness = updateCustomChartRenderReadiness(readiness, event.data);
        const action = handleCustomChartFrameMessage(event.data, {
            vizContext: customChartType.vizContext,
            colorScheme: getHostColorScheme(),
        });
        switch (action.kind) {
            case 'reply':
                post(action.message);
                return;
            case 'rendered':
                stopDeadline();
                return;
            case 'ignore':
                return;
            default:
                assertUnreachable(action, 'Unknown chart frame action');
        }
    };

    iframe.addEventListener('load', onLoad);
    window.addEventListener('message', onMessage);
    customChartContainer.appendChild(iframe);
    startDeadline(CUSTOM_CHART_LOAD_TIMEOUT_MS);
    postToCustomChart = post;
    teardownCustomChart = () => {
        stopDeadline();
        window.removeEventListener('message', onMessage);
        iframe.removeEventListener('load', onLoad);
        iframe.remove();
        URL.revokeObjectURL(blobUrl);
    };
}

// html and body fill the viewport, so the auto-resize observer misses later content changes
function reportViewSize(): void {
    const root = document.documentElement;
    const previousHeight = root.style.height;
    root.style.height = 'max-content';
    const height = Math.ceil(root.getBoundingClientRect().height);
    root.style.height = previousHeight;
    void app.sendSizeChanged({ width: Math.ceil(window.innerWidth), height });
}

/** Fetches the bundle from the preview origin; a newer tool result discards a pending fetch. */
function loadCustomChart(
    customChartType: CustomChartTypeResult,
    onFailure: () => void,
): void {
    clearCustomChart();
    chartContainer.style.display = 'none';
    resultContainer.style.display = 'none';
    // Keep the view's height while the bundle loads so the host doesn't collapse it
    customChartContainer.style.display = 'block';

    const controller = new AbortController();
    let superseded = false;
    // A timed-out fetch rejects, so it lands on the unavailable path below.
    const fetchTimeout = setTimeout(
        () => controller.abort(),
        CUSTOM_CHART_LOAD_TIMEOUT_MS,
    );
    teardownCustomChart = () => {
        superseded = true;
        clearTimeout(fetchTimeout);
        controller.abort();
    };
    const hostCallsServerTools = Boolean(
        app.getHostCapabilities()?.serverTools,
    );
    void loadMcpCustomChartFrameHtml(
        {
            projectUuid: customChartType.renderArgs.projectUuid,
            agentUuid: customChartType.renderArgs.agentUuid ?? null,
            dataAppVizUuid: customChartType.dataAppVizUuid,
            version: customChartType.version,
        },
        {
            callTool: hostCallsServerTools
                ? (params, options) => app.callServerTool(params, options)
                : null,
            fetchFn: (url, init) => fetch(url, init),
            signal: controller.signal,
        },
    ).then((result) => {
        clearTimeout(fetchTimeout);
        if (superseded) return;
        switch (result.kind) {
            case 'html':
                renderCustomChart(result.html, customChartType, onFailure);
                return;
            case 'unavailable':
                clearCustomChart();
                onFailure();
                return;
            default:
                assertUnreachable(result, 'Unknown chart type html result');
        }
    });
}

type MessageKind = 'loading' | 'error' | 'info';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function getStructuredResult(structuredContent: unknown): ChartToolResult {
    if (!isRecord(structuredContent)) {
        return {};
    }

    // Keep old app payloads working while MCP tool results move under
    // structuredContent.result.
    const { result } = structuredContent;
    if (isRecord(result)) {
        return result as ChartToolResult;
    }

    return structuredContent as ChartToolResult;
}

function getToolResultPayload(result: unknown): ChartToolResult {
    if (!isRecord(result)) {
        return {};
    }

    const structured = getStructuredResult(result.structuredContent);
    const meta = isRecord(result._meta)
        ? getStructuredResult(result._meta)
        : {};

    return {
        ...structured,
        ...meta,
    };
}

function clearRenderedContent(): void {
    chartContainer.style.display = 'none';
    resultContainer.style.display = 'none';
    resultContainer.innerHTML = '';
    card.dataset.framed = 'false';
    hideCardFooter();
}

function getTextContent(result: unknown): string | null {
    if (!isRecord(result) || !Array.isArray(result.content)) {
        return null;
    }

    const textParts = result.content.flatMap((item) => {
        if (!isRecord(item) || item.type !== 'text') {
            return [];
        }

        return typeof item.text === 'string' ? [item.text] : [];
    });

    return textParts.length > 0 ? textParts.join('\n') : null;
}

function getMessageKind(
    result: unknown,
    structured: ChartToolResult,
): MessageKind {
    if (structured.status === 'running') {
        return 'loading';
    }

    if (
        structured.status === 'error' ||
        structured.status === 'cancelled' ||
        structured.status === 'expired' ||
        (isRecord(result) && result.isError === true)
    ) {
        return 'error';
    }

    return 'info';
}

function renderMessageContent(text: string, kind: MessageKind): void {
    chartContainer.style.display = 'none';
    resultContainer.style.display = 'block';
    card.dataset.framed = 'false';
    hideCardFooter();
    resultContainer.innerHTML = `<div class="message message--${kind}"><pre>${escapeHtml(
        text,
    )}</pre></div>`;
}

app.ontoolresult = (result) => {
    const structured = getToolResultPayload(result);
    clearCustomChart();
    const customChartType = structured?.customChartType;

    if (customChartType?.dataAppVizUuid) {
        loadCustomChart(customChartType, () =>
            renderTable(structured.rows ?? [], structured.fields ?? {}),
        );
    } else if (structured?.echartsOption) {
        renderChart(structured.echartsOption);
    } else if (structured?.rows) {
        renderTable(structured.rows ?? [], structured.fields ?? {});
    } else {
        const text = getTextContent(result);
        if (text) {
            renderMessageContent(text, getMessageKind(result, structured));
        } else {
            clearRenderedContent();
        }
        return;
    }

    renderCardFooter({
        rowCount: structured.rows?.length ?? null,
        url: structured.exploreUrl ?? null,
    });
};

app.onhostcontextchanged = (changed) => {
    applyHostContext(changed);
    postToCustomChart?.(getCustomChartThemeMessage(getHostColorScheme()));
    if (
        chart &&
        lastChartOption &&
        chartContainer.style.display !== 'none' &&
        chartColorScheme !== getHostColorScheme()
    ) {
        setChartOption(initChart(), lastChartOption);
    }
};

let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
const resizeObserver = new ResizeObserver(() => {
    if (chart) {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            chart?.resize();
        }, 100);
    }
});
resizeObserver.observe(chartContainer);
new ResizeObserver(reportViewSize).observe(card);

void app.connect().then(() => {
    const hostContext = app.getHostContext();
    if (hostContext) applyHostContext(hostContext);
});
