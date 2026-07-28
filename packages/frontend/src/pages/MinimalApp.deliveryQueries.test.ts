import { type DeliveryQuery } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    DELIVERY_QUERIES_GLOBAL,
    publishDeliveryQueriesToWindow,
    readDeliveryQueriesFromWindow,
} from './MinimalApp.deliveryQueries';

const declaration: DeliveryQuery = {
    kind: 'savedChart',
    label: 'Linked revenue',
    chartUuid: 'chart-1',
};

describe('MinimalApp delivery query exposure', () => {
    it('reads back an empty list before anything is published', () => {
        delete (window as unknown as Record<string, unknown>)[
            DELIVERY_QUERIES_GLOBAL
        ];
        expect(readDeliveryQueriesFromWindow()).toEqual([]);
    });

    it('exposes published declarations on the window global', () => {
        publishDeliveryQueriesToWindow([declaration]);
        expect(readDeliveryQueriesFromWindow()).toEqual([declaration]);
    });

    it('replaces the previous set on republish', () => {
        publishDeliveryQueriesToWindow([declaration]);
        publishDeliveryQueriesToWindow([]);
        expect(readDeliveryQueriesFromWindow()).toEqual([]);
    });
});
