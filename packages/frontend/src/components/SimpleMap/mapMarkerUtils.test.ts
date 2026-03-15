import { describe, expect, it } from 'vitest';
import { getCopyValue, getFormattedValue } from './mapMarkerUtils';

describe('getFormattedValue', () => {
    it('returns formatted value when available', () => {
        const rowData = {
            revenue: { value: { formatted: '$1,000', raw: 1000 } },
        };
        expect(getFormattedValue(rowData, 'revenue')).toBe('$1,000');
    });

    it('falls back to raw value when formatted is missing', () => {
        const rowData = {
            revenue: { value: { raw: 1000 } },
        };
        expect(getFormattedValue(rowData, 'revenue')).toBe(1000);
    });

    it('returns empty string for missing field', () => {
        expect(getFormattedValue({}, 'nonexistent')).toBe('');
    });

    it('returns empty string when value is null', () => {
        const rowData = { field: { value: null } };
        expect(getFormattedValue(rowData, 'field')).toBe('');
    });
});

describe('getCopyValue', () => {
    const tooltipFields = [
        { fieldId: 'name', label: 'Name', visible: true },
        { fieldId: 'revenue', label: 'Revenue', visible: true },
        { fieldId: 'hidden', label: 'Hidden', visible: false },
    ];

    const rowData = {
        name: { value: { formatted: 'Store A', raw: 'Store A' } },
        revenue: { value: { formatted: '$1,000', raw: 1000 } },
        hidden: { value: { formatted: 'secret', raw: 'secret' } },
    };

    it('returns comma-separated visible field values', () => {
        expect(getCopyValue(tooltipFields, rowData)).toBe('Store A, $1,000');
    });

    it('returns single value without comma for one visible field', () => {
        const singleField = [
            { fieldId: 'name', label: 'Name', visible: true },
        ];
        expect(getCopyValue(singleField, rowData)).toBe('Store A');
    });

    it('returns empty string when no visible fields', () => {
        const noVisible = [
            { fieldId: 'hidden', label: 'Hidden', visible: false },
        ];
        expect(getCopyValue(noVisible, rowData)).toBe('');
    });

    it('excludes hidden fields from output', () => {
        const result = getCopyValue(tooltipFields, rowData);
        expect(result).not.toContain('secret');
    });
});
