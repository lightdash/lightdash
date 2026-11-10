import { WarehouseTypes } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getExplorerConnectionLabel,
    getWarehouseSqlCaption,
    resolveNewCalculationEditMode,
} from './mixedWarehouseConnections';

describe('getExplorerConnectionLabel', () => {
    it('keeps the connection name with the flag off', () => {
        expect(
            getExplorerConnectionLabel(
                'Reporting replica',
                WarehouseTypes.POSTGRES,
                false,
            ),
        ).toBe('Reporting replica');
    });

    it('adds the warehouse type with the flag on', () => {
        expect(
            getExplorerConnectionLabel(
                'Reporting replica',
                WarehouseTypes.BIGQUERY,
                true,
            ),
        ).toBe('Reporting replica · BigQuery');
    });

    it('keeps a missing connection name with the flag on', () => {
        expect(
            getExplorerConnectionLabel(null, WarehouseTypes.BIGQUERY, true),
        ).toBeNull();
    });
});

describe('getWarehouseSqlCaption', () => {
    it('shows no caption with the flag off', () => {
        expect(getWarehouseSqlCaption(WarehouseTypes.TRINO, false)).toBeNull();
    });

    it('names the dialect with the flag on', () => {
        expect(getWarehouseSqlCaption(WarehouseTypes.TRINO, true)).toBe(
            'Trino SQL',
        );
    });

    it('shows no caption without a warehouse type', () => {
        expect(getWarehouseSqlCaption(null, true)).toBeNull();
    });
});

describe('resolveNewCalculationEditMode', () => {
    const base = {
        preferredMode: 'formula',
        sqlMode: 'sql',
        isNewCalculation: true,
        isFormulaSupported: false,
    };

    it('keeps the preferred mode with the flag off', () => {
        expect(
            resolveNewCalculationEditMode({
                ...base,
                mixedWarehouseConnectionsEnabled: false,
            }),
        ).toBe('formula');
    });

    it('uses SQL for a new calculation without formula support with the flag on', () => {
        expect(
            resolveNewCalculationEditMode({
                ...base,
                mixedWarehouseConnectionsEnabled: true,
            }),
        ).toBe('sql');
    });

    it('keeps the mode of an existing calculation with the flag on', () => {
        expect(
            resolveNewCalculationEditMode({
                ...base,
                isNewCalculation: false,
                mixedWarehouseConnectionsEnabled: true,
            }),
        ).toBe('formula');
    });
});
