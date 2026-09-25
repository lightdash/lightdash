import {
    formatItemValue,
    getItemLabelWithoutTableName,
    type ItemsMap,
} from '@lightdash/common';
import { stringify } from 'csv-stringify/sync';
import { CsvService } from '../../../../services/CsvService/CsvService';

export const convertQueryResultsToCsv = (
    queryResults: {
        rows: Record<string, unknown>[];
        fields: ItemsMap;
    },
    /** Caps the rows written into model context; the query keeps the rest. */
    maxRows?: number,
): string => {
    const fieldIds = queryResults.rows[0]
        ? Object.keys(queryResults.rows[0])
        : [];

    const csvHeaders = fieldIds.map((fieldId) => {
        const item = queryResults.fields[fieldId];
        if (!item) {
            return fieldId;
        }
        return getItemLabelWithoutTableName(item);
    });

    const rows = (
        maxRows === undefined
            ? queryResults.rows
            : queryResults.rows.slice(0, maxRows)
    ).map((row) =>
        CsvService.convertRowToCsv(row, queryResults.fields, true, fieldIds),
    );

    return stringify(rows, { header: true, columns: csvHeaders });
};

const escapeMarkdownCell = (value: unknown): string =>
    String(value ?? '')
        .replaceAll('|', '\\|')
        .replaceAll(/\r?\n/g, ' ');

export const convertQueryResultsToMarkdown = (
    queryResults: {
        rows: Record<string, unknown>[];
        fields: ItemsMap;
    },
    maxRows = 8,
    maxColumns = 6,
): string | null => {
    const firstRow = queryResults.rows[0];
    if (!firstRow) return null;

    const fieldIds = Object.keys(firstRow).slice(0, maxColumns);
    if (fieldIds.length === 0) return null;

    const headers = fieldIds.map((fieldId) => {
        const item = queryResults.fields[fieldId];
        return item ? getItemLabelWithoutTableName(item) : fieldId;
    });
    const rows = queryResults.rows
        .slice(0, maxRows)
        .map((row) =>
            CsvService.convertRowToCsv(
                row,
                queryResults.fields,
                false,
                fieldIds,
            ).map(escapeMarkdownCell),
        );

    if (rows.length === 1 && headers.length === 1) {
        return `**${escapeMarkdownCell(headers[0])}:** ${rows[0][0]}`;
    }
    if (rows.length === 1) {
        return headers
            .map(
                (header, index) =>
                    `- **${escapeMarkdownCell(header)}:** ${rows[0][index]}`,
            )
            .join('\n');
    }

    const table = [
        `| ${headers.map(escapeMarkdownCell).join(' | ')} |`,
        `| ${headers.map(() => '---').join(' | ')} |`,
        ...rows.map((row) => `| ${row.join(' | ')} |`),
    ];
    if (
        queryResults.rows.length > maxRows ||
        Object.keys(firstRow).length > maxColumns
    ) {
        table.push(
            `\n_Showing ${rows.length} of ${queryResults.rows.length} rows and ${headers.length} columns._`,
        );
    }
    return table.join('\n');
};

/** One factual line for a charted answer: what it shows and where the first metric is highest and lowest. */
export const summarizeChartedResults = (
    queryResults: {
        rows: Record<string, unknown>[];
        fields: ItemsMap;
    },
    chart: {
        xAxisDimension: string | null;
        yAxisMetrics: string[] | null;
        groupBy: string[] | null;
    },
): string | null => {
    const x = chart.xAxisDimension;
    const metric = chart.yAxisMetrics?.[0];
    if (!x || !metric) return null;
    const labelOf = (fieldId: string) => {
        const item = queryResults.fields[fieldId];
        return item ? getItemLabelWithoutTableName(item) : fieldId;
    };
    const pointIds = [x, ...(chart.groupBy ?? [])];
    const points = queryResults.rows.flatMap((row) => {
        const value = Number(row[metric]);
        if (row[metric] === null || !Number.isFinite(value)) return [];
        const cells = [...pointIds, metric].map((fieldId) => {
            const item = queryResults.fields[fieldId];
            return escapeMarkdownCell(
                item ? formatItemValue(item, row[fieldId]) : row[fieldId],
            );
        });
        return [
            {
                value,
                where: cells.slice(0, pointIds.length).join(' · '),
                formatted: cells[pointIds.length],
            },
        ];
    });
    if (points.length < 2) return null;
    const sorted = [...points].sort((left, right) => right.value - left.value);
    const highest = sorted[0];
    const lowest = sorted[sorted.length - 1];
    return [
        `**${escapeMarkdownCell(labelOf(metric))}** by ${escapeMarkdownCell(pointIds.map(labelOf).join(' and '))}, ${queryResults.rows.length} rows.`,
        `Highest: ${highest.where} at **${highest.formatted}**. Lowest: ${lowest.where} at **${lowest.formatted}**.`,
    ].join(' ');
};
