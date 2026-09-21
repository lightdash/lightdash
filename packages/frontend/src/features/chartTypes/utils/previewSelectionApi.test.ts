import { type DataAppVizPreviewSelection } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { type PreviewQuerySelection } from '../builder/previewDataTypes';
import {
    previewSelectionFromApi,
    previewSelectionToApi,
} from './previewSelectionApi';

const stored: DataAppVizPreviewSelection = {
    version: 1,
    exploreName: 'customers',
    savedChart: { uuid: 'chart-1', name: 'Channel to plan' },
    metricQuery: {
        exploreName: 'customers',
        dimensions: ['customers_channel'],
        metrics: ['customers_count'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
        additionalMetrics: null,
        customDimensions: null,
    },
    fieldMapping: { source: 'customers_channel', value: 'customers_count' },
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedByUserUuid: 'user-1',
};

describe('previewSelectionFromApi', () => {
    it('reads a stored selection back as a query the preview can bind', () => {
        expect(previewSelectionFromApi(stored)).toEqual({
            kind: 'query',
            exploreName: 'customers',
            savedChart: { uuid: 'chart-1', name: 'Channel to plan' },
            metricQuery: {
                exploreName: 'customers',
                dimensions: ['customers_channel'],
                metrics: ['customers_count'],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: undefined,
                customDimensions: undefined,
            },
            fieldMapping: stored.fieldMapping,
        });
    });

    it('has nothing to offer without a stored selection', () => {
        expect(previewSelectionFromApi(null)).toBeNull();
    });

    it('drops a query that belongs to another explore', () => {
        expect(
            previewSelectionFromApi({
                ...stored,
                metricQuery: { ...stored.metricQuery, exploreName: 'orders' },
            }),
        ).toBeNull();
    });
});

describe('previewSelectionToApi', () => {
    it('sends the query shape and the binding, and nothing else', () => {
        const ran = {
            ...previewSelectionFromApi(stored)!,
            // The Explorer hands these along with a saved chart's query.
            metricQuery: {
                ...previewSelectionFromApi(stored)!.metricQuery,
                metadata: { hasADateDimension: { label: 'Signup date' } },
            },
        } as PreviewQuerySelection;

        const body = previewSelectionToApi(ran);

        expect(Object.keys(body)).toEqual([
            'exploreName',
            'savedChart',
            'metricQuery',
            'fieldMapping',
        ]);
        expect(body.metricQuery).toEqual({
            exploreName: 'customers',
            dimensions: ['customers_channel'],
            metrics: ['customers_count'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: null,
            customDimensions: null,
        });
    });
});
