import {
    FieldType,
    MetricType,
    type ResultRow,
    type ResultValue,
} from '@lightdash/common';
import { MantineProvider } from '@mantine-8/core';
import { type CellContext } from '@tanstack/react-table';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { formatCellContent, getFormattedValueCell } from './useColumns';

/* eslint-disable testing-library/no-container */
/* eslint-disable testing-library/no-node-access */
// Note: We need to use container.querySelector for testing bar chart implementation details
// (checking if bar elements exist and have correct styles). These are not semantic elements
// with roles, so Testing Library's role-based queries don't apply here.

// Helper to create a mock cell context
const createMockCellContext = ({
    columnId,
    value,
    minMaxMap,
    columnProperties,
    item,
}: {
    columnId: string;
    value: ResultValue;
    minMaxMap?: Record<string, { min: number; max: number }>;
    columnProperties?: Record<string, { displayStyle?: 'text' | 'bar' }>;
    item?: any;
}): CellContext<ResultRow, { value: ResultValue }> => {
    return {
        getValue: () => ({ value }),
        column: {
            id: columnId,
            columnDef: {
                meta: item ? { item } : undefined,
            },
        },
        table: {
            options: {
                meta: {
                    minMaxMap,
                    columnProperties,
                },
            },
        },
    } as any;
};

// Helper to render components with MantineProvider
const renderWithMantine = (component: React.ReactElement) => {
    return render(<MantineProvider>{component}</MantineProvider>);
};

describe('getFormattedValueCell - Bar Chart Display', () => {
    test('should render bar for positive number when displayStyle is bar', () => {
        const context = createMockCellContext({
            columnId: 'revenue',
            value: {
                raw: 75,
                formatted: '$75',
            },
            minMaxMap: {
                revenue: { min: 0, max: 100 },
            },
            columnProperties: {
                revenue: { displayStyle: 'bar' },
            },
        });

        const result = getFormattedValueCell(context);
        const { container } = renderWithMantine(result as React.ReactElement);

        // Should have a bar element (div with grid display)
        const gridContainer = container.querySelector(
            'div[style*="grid-template-columns"]',
        );
        expect(gridContainer).toBeTruthy();

        // Should have a bar element (the colored box)
        const barElement = container.querySelector('div[style*="width: 75%"]');
        expect(barElement).toBeTruthy();

        // Should display the formatted value
        expect(screen.getByText('$75')).toBeInTheDocument();

        // Bar width should be 75% (75 out of 100)
        const style = barElement?.getAttribute('style') || '';
        expect(style).toContain('width: 75%');
        // Should have background color
        expect(style).toContain('background');
    });

    test('should not render bar for negative number', () => {
        const context = createMockCellContext({
            columnId: 'revenue',
            value: {
                raw: -25,
                formatted: '-$25',
            },
            minMaxMap: {
                revenue: { min: -100, max: 100 },
            },
            columnProperties: {
                revenue: { displayStyle: 'bar' },
            },
        });

        const result = getFormattedValueCell(context);
        const { container } = renderWithMantine(result as React.ReactElement);

        // Should have the grid container but no colored bar for negative numbers
        const gridContainer = container.querySelector(
            'div[style*="grid-template-columns"]',
        );
        expect(gridContainer).toBeTruthy();

        // Should not have a bar element with width % for negative numbers
        const barElement = container.querySelector(
            'div[style*="width:"][style*="%"]',
        );
        expect(barElement).toBeFalsy();

        // Should still display the formatted value
        expect(screen.getByText('-$25')).toBeInTheDocument();
    });

    test('should not render bar for zero', () => {
        const context = createMockCellContext({
            columnId: 'revenue',
            value: {
                raw: 0,
                formatted: '$0',
            },
            minMaxMap: {
                revenue: { min: 0, max: 100 },
            },
            columnProperties: {
                revenue: { displayStyle: 'bar' },
            },
        });

        const result = getFormattedValueCell(context);
        const { container } = renderWithMantine(result as React.ReactElement);

        // Should have the grid container but no colored bar for zero
        const gridContainer = container.querySelector(
            'div[style*="grid-template-columns"]',
        );
        expect(gridContainer).toBeTruthy();

        // Should not have a bar element with width % for zero
        const barElement = container.querySelector(
            'div[style*="width:"][style*="%"]',
        );
        expect(barElement).toBeFalsy();

        // Should still display the formatted value
        expect(screen.getByText('$0')).toBeInTheDocument();
    });

    test('should not render bar when displayStyle is text', () => {
        const context = createMockCellContext({
            columnId: 'revenue',
            value: {
                raw: 'foo',
                formatted: 'foo',
            },
            minMaxMap: {
                revenue: { min: 0, max: 100 },
            },
            columnProperties: {
                revenue: { displayStyle: 'text' },
            },
        });

        const result = getFormattedValueCell(context);

        // Should return plain formatted text, not a React element with bar
        expect(result).toBe('foo');
    });

    test('should not render bar when minMaxMap is not provided (results table)', () => {
        const context = createMockCellContext({
            columnId: 'revenue',
            value: {
                raw: 75,
                formatted: '$75',
            },
            columnProperties: {
                revenue: { displayStyle: 'bar' },
            },
            // minMaxMap not provided
        });

        const result = getFormattedValueCell(context);

        // Should return plain formatted text without bar
        expect(result).toBe('$75');
    });

    test('should use base field ID for pivot tables', () => {
        const mockItem = {
            name: 'total_revenue',
            table: 'orders',
            fieldType: 'metric',
            type: 'sum',
        };

        const context = createMockCellContext({
            columnId: 'total_revenue_active', // Pivoted column ID
            value: {
                raw: 150,
                formatted: '$150',
            },
            minMaxMap: {
                orders_total_revenue: { min: 0, max: 200 }, // Stored under base field ID
            },
            columnProperties: {
                orders_total_revenue: { displayStyle: 'bar' }, // Stored under base field ID (table_name)
            },
            item: mockItem,
        });

        const result = getFormattedValueCell(context);
        const { container } = renderWithMantine(result as React.ReactElement);

        // Should render bar because it looks up columnProperties using base field ID
        const barElement = container.querySelector('div[style*="width: 75%"]');
        expect(barElement).toBeTruthy();

        // Bar width should be 75% (150 out of 200)
        const style = barElement?.getAttribute('style') || '';
        expect(style).toContain('width: 75%');
        // Should have background color
        expect(style).toContain('background');
    });

    test('should calculate bar width percentage correctly', () => {
        const testCases = [
            { value: 0, min: 0, max: 100, expected: 0 },
            { value: 50, min: 0, max: 100, expected: 50 },
            { value: 100, min: 0, max: 100, expected: 100 },
            { value: 25, min: 0, max: 100, expected: 25 },
            { value: 150, min: 100, max: 200, expected: 50 }, // Offset range
            { value: 75, min: 50, max: 100, expected: 50 }, // Offset range
        ];

        testCases.forEach(({ value, min, max, expected }) => {
            // Skip zero since it doesn't render a bar
            if (value === 0) return;

            const context = createMockCellContext({
                columnId: 'revenue',
                value: {
                    raw: value,
                    formatted: `$${value}`,
                },
                minMaxMap: {
                    revenue: { min, max },
                },
                columnProperties: {
                    revenue: { displayStyle: 'bar' },
                },
            });

            const result = getFormattedValueCell(context);
            const { container } = renderWithMantine(
                result as React.ReactElement,
            );

            const barElement = container.querySelector(
                `div[style*="width: ${expected}%"]`,
            );
            expect(barElement).toBeTruthy();
            const style = barElement?.getAttribute('style') || '';
            expect(style).toContain(`width: ${expected}%`);
            // Should have background color
            expect(style).toContain('background');
        });
    });

    test('should handle edge case when range is zero', () => {
        const context = createMockCellContext({
            columnId: 'revenue',
            value: {
                raw: 50,
                formatted: '$50',
            },
            minMaxMap: {
                revenue: { min: 50, max: 50 }, // Same min and max
            },
            columnProperties: {
                revenue: { displayStyle: 'bar' },
            },
        });

        const result = getFormattedValueCell(context);
        const { container } = renderWithMantine(result as React.ReactElement);

        const barElement = container.querySelector('div[style*="width: 0%"]');
        // Should render with 0% width when range is zero
        expect(barElement).toBeTruthy();
        const style = barElement?.getAttribute('style') || '';
        expect(style).toContain('width: 0%');
        // Should have background color
        expect(style).toContain('background');
    });

    test('should render bar with minimum width for very small values', () => {
        const context = createMockCellContext({
            columnId: 'revenue',
            value: {
                raw: 1,
                formatted: '$1',
            },
            minMaxMap: {
                revenue: { min: 0, max: 1000 },
            },
            columnProperties: {
                revenue: { displayStyle: 'bar' },
            },
        });

        const result = getFormattedValueCell(context);
        const { container } = renderWithMantine(result as React.ReactElement);

        // Should have the grid container
        const gridContainer = container.querySelector(
            'div[style*="grid-template-columns"]',
        );
        expect(gridContainer).toBeTruthy();

        // Should have a bar element (even if very small, it should be 0.1% width)
        // The value is 1 out of 1000, which is 0.1%
        const barElement = container.querySelector('div[style*="width: 0.1%"]');
        expect(barElement).toBeTruthy();

        // Should have the default color (#5470c6)
        const style = barElement?.getAttribute('style') || '';
        expect(style).toContain('background');
    });
});

describe('formatCellContent - Parameter-based formatting', () => {
    test('should format with conditional currency based on parameter - USD', () => {
        const mockItem = {
            name: 'revenue',
            table: 'orders',
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            label: 'Revenue',
            sql: 'revenue',
            tableLabel: 'Orders',
            hidden: false,
            format: '${ld.parameters.currency=="USD"?"$":"€"}0,0.00',
        };

        const data = {
            value: { raw: 2815413.64, formatted: '2,815,413.64' },
        };

        const parameters = { currency: 'USD' };

        const result = formatCellContent(data, mockItem, parameters);
        expect(result).toBe('$2,815,413.64');
    });

    test('should format with conditional currency based on parameter - EUR', () => {
        const mockItem = {
            name: 'revenue',
            table: 'orders',
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            label: 'Revenue',
            sql: 'revenue',
            tableLabel: 'Orders',
            hidden: false,
            format: '${ld.parameters.currency=="USD"?"$":"€"}0,0.00',
        };

        const data = {
            value: { raw: 2815413.64, formatted: '2,815,413.64' },
        };

        const parameters = { currency: 'EUR' };

        const result = formatCellContent(data, mockItem, parameters);
        expect(result).toBe('€2,815,413.64');
    });

    test('should use backend-formatted value when no parameter format is present', () => {
        const mockItem = {
            name: 'revenue',
            table: 'orders',
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            label: 'Revenue',
            sql: 'revenue',
            tableLabel: 'Orders',
            hidden: false,
            format: '$0,0.00', // No parameters
        };

        const data = {
            value: { raw: 2815413.64, formatted: '$2,815,413.64' },
        };

        const parameters = { currency: 'USD' };

        const result = formatCellContent(data, mockItem, parameters);
        // Should use backend-formatted value since format doesn't use parameters
        expect(result).toBe('$2,815,413.64');
    });

    test('should use backend-formatted value when parameters are not provided', () => {
        const mockItem = {
            name: 'revenue',
            table: 'orders',
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            label: 'Revenue',
            sql: 'revenue',
            tableLabel: 'Orders',
            hidden: false,
            format: '${ld.parameters.currency=="USD"?"$":"€"}0,0.00',
        };

        const data = {
            value: { raw: 2815413.64, formatted: '$2,815,413.64' },
        };

        const result = formatCellContent(data, mockItem, undefined);
        // Should use backend-formatted value when parameters are undefined
        expect(result).toBe('$2,815,413.64');
    });

    test('should handle simple parameter substitution', () => {
        const mockItem = {
            name: 'revenue',
            table: 'orders',
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            label: 'Revenue',
            sql: 'revenue',
            tableLabel: 'Orders',
            hidden: false,
            format: '${ld.parameters.symbol}0,0.00',
        };

        const data = {
            value: { raw: 1234.56, formatted: '1,234.56' },
        };

        const parameters = { symbol: '£' };

        const result = formatCellContent(data, mockItem, parameters);
        expect(result).toBe('£1,234.56');
    });

    test('should return hyphen when data is undefined', () => {
        const mockItem = {
            name: 'revenue',
            table: 'orders',
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            label: 'Revenue',
            sql: 'revenue',
            tableLabel: 'Orders',
            hidden: false,
            format: '${ld.parameters.currency=="USD"?"$":"€"}0,0.00',
        };

        const result = formatCellContent(undefined, mockItem, {
            currency: 'USD',
        });
        expect(result).toBe('-');
    });

    test('should work with lightdash.parameters prefix', () => {
        const mockItem = {
            name: 'revenue',
            table: 'orders',
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            label: 'Revenue',
            sql: 'revenue',
            tableLabel: 'Orders',
            hidden: false,
            format: '${lightdash.parameters.symbol}0,0.00',
        };

        const data = {
            value: { raw: 5000.75, formatted: '5,000.75' },
        };

        expect(formatCellContent(data, mockItem, { symbol: '¥' })).toBe(
            '¥5,000.75',
        );
    });
});
