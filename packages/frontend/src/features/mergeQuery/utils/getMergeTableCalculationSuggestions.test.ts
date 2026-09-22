import {
    FieldType,
    MetricType,
    type ItemsMap,
    type MergeFieldOrigins,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getMergeTableCalculationSuggestions } from './getMergeTableCalculationSuggestions';

const fields: ItemsMap = {
    deals_unique_deals: {
        fieldType: FieldType.METRIC,
        type: MetricType.COUNT_DISTINCT,
        name: 'unique_deals',
        label: 'Unique deals',
        table: 'deals',
        tableLabel: 'Deals',
        sql: '',
        hidden: false,
    },
    tracks_event_count: {
        fieldType: FieldType.METRIC,
        type: MetricType.COUNT,
        name: 'event_count',
        label: 'Event count',
        table: 'tracks',
        tableLabel: 'Tracks',
        sql: '',
        hidden: false,
    },
    merge_existing_ratio: {
        fieldType: FieldType.METRIC,
        type: MetricType.NUMBER,
        name: 'existing_ratio',
        label: 'Existing ratio',
        table: 'merge',
        tableLabel: 'Merged',
        sql: '',
        hidden: false,
    },
};

const fieldOrigins: MergeFieldOrigins = {
    deals_unique_deals: {
        kind: 'source',
        sourceId: 'deals',
        sourceFieldId: 'deals_unique_deals',
    },
    tracks_event_count: {
        kind: 'source',
        sourceId: 'tracks',
        sourceFieldId: 'tracks_event_count',
    },
    merge_existing_ratio: { kind: 'tableCalculation' },
};

describe('getMergeTableCalculationSuggestions', () => {
    it('lists joined fields from every source and excludes recursive calculations', () => {
        const suggestions = getMergeTableCalculationSuggestions({
            columnOrder: [
                'deals_unique_deals',
                'tracks_event_count',
                'merge_existing_ratio',
            ],
            fields,
            fieldOrigins,
        });

        expect(suggestions.map(({ id, label }) => ({ id, label }))).toEqual([
            { id: 'deals_unique_deals', label: 'Deals · Unique deals' },
            { id: 'tracks_event_count', label: 'Tracks · Event count' },
        ]);
    });
});
