import {
    ExternalSourceStatus,
    ExternalSourceType,
    type ExternalSource,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getExternalSourceRef,
    getExternalSourceState,
    toExternalSourceRows,
} from './externalSourceRows';

const source = (overrides: Partial<ExternalSource>): ExternalSource =>
    ({
        sourceUuid: 's-1',
        type: ExternalSourceType.CSV,
        name: 'targets',
        status: ExternalSourceStatus.READY,
        errorMessage: null,
        lastRefreshedAt: null,
        tables: [
            {
                tableUuid: 't-1',
                sourceUuid: 's-1',
                name: 'targets',
                label: 'Targets',
                rowCount: 12345,
                totalBytes: 2048,
            },
        ],
        ...overrides,
    }) as ExternalSource;

describe('externalSourceRows', () => {
    it('sorts by label and formats each row', () => {
        const rows = toExternalSourceRows([
            source({}),
            source({
                sourceUuid: 's-2',
                type: ExternalSourceType.GOOGLE_SHEETS,
                tables: [],
                name: 'Budget sheet',
            }),
        ]);
        expect(rows.map(({ label }) => label)).toEqual([
            'Budget sheet',
            'Targets',
        ]);
        expect(rows[0]).toMatchObject({ type: 'Google Sheet', rows: '—' });
        expect(rows[1]).toMatchObject({
            type: 'CSV file',
            rows: (12345).toLocaleString(),
        });
    });

    it('names each state, with the error when an import failed', () => {
        expect(getExternalSourceState(source({})).label).toBe('Ready');
        expect(
            getExternalSourceState(
                source({ status: ExternalSourceStatus.STAGED }),
            ).label,
        ).toBe('Syncing');
        expect(
            getExternalSourceState(
                source({
                    status: ExternalSourceStatus.ERROR,
                    errorMessage: 'Column count changed',
                }),
            ),
        ).toEqual({
            label: 'Error',
            color: 'red',
            message: 'Column count changed',
        });
    });

    it('acts on the source table, or nothing before it has one', () => {
        expect(getExternalSourceRef(source({}))).toEqual({
            sourceUuid: 's-1',
            tableUuid: 't-1',
            sourceType: ExternalSourceType.CSV,
        });
        expect(getExternalSourceRef(source({ tables: [] }))).toBeNull();
    });
});
