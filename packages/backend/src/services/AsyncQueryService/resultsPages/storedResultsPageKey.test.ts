import type { ItemsMap } from '@lightdash/common';
import {
    resultsPageFields,
    resultsPagePivotValuesColumns,
} from './resultsPageFixtures.mock';
import { getStoredResultsPageKey } from './storedResultsPageKey';

const base = {
    resultsFileName: 'cache-key-abc123',
    appVersion: '3.393.0',
    format: {
        fields: resultsPageFields,
        pivotValuesColumns: null,
        timezone: null,
    },
    pageSize: 500,
    page: 1,
};

describe('stored results page key', () => {
    test('sits next to the results file and names version, page size and page', () => {
        expect(getStoredResultsPageKey(base)).toMatch(
            /^cache-key-abc123\.pages\/3\.393\.0\/[0-9a-f]{64}\/500\/1\.json\.br$/,
        );
    });

    test('does not depend on the key order of the format inputs', () => {
        const reordered = Object.fromEntries(
            Object.entries(resultsPageFields).reverse(),
        ) as ItemsMap;

        expect(
            getStoredResultsPageKey({
                ...base,
                format: { ...base.format, fields: reordered },
            }),
        ).toBe(getStoredResultsPageKey(base));
    });

    test.each([
        [
            'fields',
            {
                format: {
                    ...base.format,
                    fields: {
                        ...resultsPageFields,
                        orders_amount: {
                            ...resultsPageFields.orders_amount,
                            round: 3,
                        },
                    } as ItemsMap,
                },
            },
        ],
        [
            'pivotValuesColumns',
            {
                format: {
                    ...base.format,
                    pivotValuesColumns: resultsPagePivotValuesColumns,
                },
            },
        ],
        ['timezone', { format: { ...base.format, timezone: 'Europe/London' } }],
        ['pageSize', { pageSize: 56 }],
        ['page', { page: 2 }],
        ['app version', { appVersion: '3.394.0' }],
        ['results file', { resultsFileName: 'cache-key-def456' }],
    ])('changes when %s changes', (_name, change) => {
        expect(getStoredResultsPageKey({ ...base, ...change })).not.toBe(
            getStoredResultsPageKey(base),
        );
    });
});
