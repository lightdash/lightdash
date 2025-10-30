import { type MantineTheme } from '@mantine/core';
import type { CSSProperties } from 'react';

/**
 * Helper to convert style object to CSS string
 * We need this because ECharts doesn't support style objects directly
 */
const stylesToString = (styles: CSSProperties) =>
    Object.entries(styles)
        .map(([key, value]) => {
            // Convert camelCase to kebab-case
            const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
            return `${kebabKey}: ${value}`;
        })
        .join('; ');

/**
 * Get base tooltip styling
 */
export const getTooltipStyle = (theme: MantineTheme) => ({
    padding: 8,
    borderColor: theme.colors.gray[3],
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    textStyle: {
        color: theme.colors.gray[7],
        fontSize: 12,
    },
    extraCssText:
        'box-shadow: 0px 8px 8px 0px rgba(0, 0, 0, 0.08), 0px 0px 1px 0px rgba(0, 0, 0, 0.25);',
});

/**
 * Format a tooltip value with pill styling (e.g. "100% - $100")
 */
export const formatTooltipValue = (
    value: string,
    theme: MantineTheme,
): string => {
    const styles = stylesToString({
        display: 'inline-block',
        backgroundColor: theme.colors.gray[0],
        border: `1px solid ${theme.colors.gray[1]}`,
        color: theme.colors.gray[7],
        padding: '2px 8px',
        borderRadius: '6px',
        fontWeight: 600,
        fontSize: '12px',
    });
    return `<span style="${styles}">${value}</span>`;
};

/**
 * Format tooltip header (e.g. "Total Sales")
 */
export const formatTooltipHeader = (
    header: string,
    theme: MantineTheme,
): string => {
    const styles = stylesToString({
        color: theme.colors.gray[7],
        fontWeight: 500,
        fontSize: '13px',
        paddingBottom: '8px',
    });
    return `<div style="${styles}">${header}</div>`;
};

/**
 * Get tooltip divider
 */
export const getTooltipDivider = (theme: MantineTheme): string => {
    const styles = stylesToString({
        height: '1px',
        backgroundColor: theme.colors.gray[1],
        marginBottom: '4px',
    });
    return `<div style="${styles}"></div>`;
};

/**
 * Format a color indicator (square) for tooltip (e.g. a color block)
 */
export const formatColorIndicator = (color: string): string => {
    const styles = stylesToString({
        display: 'inline-block',
        width: '10px',
        height: '10px',
        backgroundColor: color,
        borderRadius: '2px',
        verticalAlign: 'middle',
    });
    return `<span style="${styles}"></span>`;
};

/**
 * Format a simple text label for tooltip (e.g. series name or category)
 * Color: gray.7, Font size: 11px
 */
export const formatTooltipLabel = (
    text: string,
    theme: MantineTheme,
): string => {
    const styles = stylesToString({
        color: theme.colors.gray[7],
        fontSize: '11px',
    });
    return `<span style="${styles}">${text}</span>`;
};

/**
 * Format a tooltip row with color indicator, label, and value (stacked layout)
 * Used for pie charts and other single-row tooltip formats
 * @param colorIndicator - HTML string for color indicator (from formatColorIndicator)
 * @param label - HTML string for label (from formatTooltipLabel)
 * @param value - HTML string for value (from formatTooltipValue)
 */
export const formatTooltipRow = (
    colorIndicator: string,
    label: string,
    value: string,
): string => {
    const rowStyles = stylesToString({
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    });
    const valueContainerStyles = stylesToString({
        marginTop: '2px',
        marginLeft: '16px',
    });
    return `<div style="${rowStyles}">${colorIndicator}${label}</div><div style="${valueContainerStyles}">${value}</div>`;
};

/**
 * Format a cartesian chart tooltip row with color indicator, series name, and value (inline layout)
 * Used for bar/line/area charts where all elements are in a single horizontal row
 * @param colorIndicator - HTML string for color indicator (from formatColorIndicator)
 * @param seriesName - Series name text
 * @param valuePill - HTML string for formatted value pill (from formatTooltipValue)
 * @param theme - Mantine theme for colors
 */
export const formatCartesianTooltipRow = (
    colorIndicator: string,
    seriesName: string,
    valuePill: string,
    theme: MantineTheme,
): string => {
    const rowStyles = stylesToString({
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '2px',
    });
    const seriesNameStyles = stylesToString({
        color: theme.colors.gray[7],
        flex: '1',
        fontSize: '12px',
    });
    return `<div style="${rowStyles}">
        ${colorIndicator}
        <span style="${seriesNameStyles}">${seriesName}</span>
        ${valuePill}
    </div>`;
};
