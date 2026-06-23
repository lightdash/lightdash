import { ExploreType, type Explore } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getExploreParameterDefinitions } from './parameters';

describe('getExploreParameterDefinitions', () => {
    it('includes active explore parameter aliases so shadowed reserved names can be matched by reference', () => {
        const definitions = getExploreParameterDefinitions({
            name: 'orders',
            label: 'Orders',
            baseTable: 'orders',
            joinedTables: [],
            type: ExploreType.DEFAULT,
            tables: {
                orders: {
                    name: 'orders',
                    label: 'Orders',
                    parameters: {
                        date_zoom: {
                            label: 'Table-scoped date zoom',
                            options: ['week'],
                        },
                    },
                    dimensions: {},
                    metrics: {},
                    lineageGraph: {},
                },
            },
            parameters: {
                date_zoom: {
                    label: 'Shadowed date zoom',
                    options: ['week'],
                },
            },
        } as unknown as Explore);

        expect(definitions['orders.date_zoom']?.label).toBe(
            'Table-scoped date zoom',
        );
        expect(definitions.date_zoom?.label).toBe('Shadowed date zoom');
    });
});
