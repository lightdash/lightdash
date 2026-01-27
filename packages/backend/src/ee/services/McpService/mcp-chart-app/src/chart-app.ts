import {
    formatCartesianTooltipRow,
    formatColorIndicator,
    formatTooltipHeader,
    formatTooltipRow,
    formatTooltipValue,
} from '@lightdash/common';
import { App } from '@modelcontextprotocol/ext-apps';
import * as echarts from 'echarts';
import { lightdashTheme } from './lightdash-theme';

// Register the custom Lightdash theme
echarts.registerTheme('lightdash', lightdashTheme);

const chartContainer = document.getElementById('chart') as HTMLDivElement;
const tableFallback = document.getElementById(
    'table-fallback',
) as HTMLDivElement;

let chart: echarts.ECharts | null = null;

// ---------------------------------------------------------------------------
// Tooltip formatter helpers (client-side, functions can't be serialized)
// ---------------------------------------------------------------------------

/** Extract color string from ECharts marker HTML or fallback. */
function extractColor(
    param: echarts.DefaultLabelFormatterCallbackParams,
): string {
    const marker = (param as { marker?: string }).marker ?? '';
    const match = marker.match(/background-color:([^;"]+)/);
    return match ? match[1] : (param.color as string) ?? '#999';
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
            : (p.value as Record<string, unknown>)?.[
                  Object.keys(p.value as object)[1] ?? ''
              ] ?? p.value,
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

function initChart(): echarts.ECharts {
    if (chart) {
        chart.dispose();
    }
    chart = echarts.init(chartContainer, 'lightdash');
    return chart;
}

function renderChart(echartsOption: echarts.EChartsOption): void {
    chartContainer.style.display = 'block';
    tableFallback.style.display = 'none';

    const instance = chart ?? initChart();

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

    instance.setOption(optionWithFormatter, true);
}

function renderTable(
    rows: Record<string, unknown>[],
    fields: Record<string, { label?: string }>,
): void {
    chartContainer.style.display = 'none';
    tableFallback.style.display = 'block';

    if (rows.length === 0) {
        tableFallback.innerHTML = '<p>No data available.</p>';
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

    tableFallback.innerHTML = `<table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

function renderExploreButton(url: string): void {
    // Remove existing button if any
    const existing = document.getElementById('explore-btn');
    if (existing) existing.remove();

    const btn = document.createElement('button');
    btn.id = 'explore-btn';
    btn.textContent = 'Explore from here';
    btn.addEventListener('click', async () => {
        const { isError } = await app.openLink({ url });
        if (isError) {
            console.warn('Host denied the request - URL:', url);
        }
    });

    document.body.appendChild(btn);
}

const app = new App({ name: 'Lightdash Chart', version: '1.0.0' });

app.ontoolresult = (result) => {
    const structured = result.structuredContent as
        | {
              echartsOption?: echarts.EChartsOption;
              rows?: Record<string, unknown>[];
              fields?: Record<string, { label?: string }>;
              exploreUrl?: string;
          }
        | undefined;

    if (structured?.echartsOption) {
        renderChart(structured.echartsOption);
    } else if (structured?.rows) {
        renderTable(structured.rows ?? [], structured.fields ?? {});
    } else {
        // Fall back to text content
        const text = result.content?.find(
            (c: { type: string }) => c.type === 'text',
        ) as { type: string; text: string } | undefined;
        if (text?.text) {
            tableFallback.style.display = 'block';
            chartContainer.style.display = 'none';
            tableFallback.innerHTML = `<pre style="white-space: pre-wrap; font-size: 13px;">${escapeHtml(
                text.text,
            )}</pre>`;
        }
    }

    // Show "Explore from here" button if URL is present
    if (structured?.exploreUrl) {
        renderExploreButton(structured.exploreUrl);
    }
};

const resizeObserver = new ResizeObserver(() => {
    if (chart) {
        // Important to call resize method to ensure the chart is responsive
        chart.resize();
    }
});
resizeObserver.observe(chartContainer);

app.connect();
