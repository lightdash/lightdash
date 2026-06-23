import {
    ExploreType,
    type Explore,
    type LightdashProjectParameter,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getExploreParameterDefinitions,
    getReferencedParameterDefinitions,
} from './parameters';

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

describe('getReferencedParameterDefinitions', () => {
    const region: LightdashProjectParameter = { label: 'Region' };
    const shadowedDateZoom: LightdashProjectParameter = {
        label: 'Shadowed date zoom',
    };

    it('returns only definitions that are referenced', () => {
        expect(
            getReferencedParameterDefinitions({ region }, ['region']),
        ).toEqual({ region });
    });

    it('excludes references that have no user definition (e.g. a reserved-only reference)', () => {
        // date_zoom is referenced but not user-defined: it is reserved-only and must not show.
        expect(
            getReferencedParameterDefinitions({ region }, ['date_zoom']),
        ).toEqual({});
    });

    it('includes a user-defined parameter that shadows a reserved name', () => {
        expect(
            getReferencedParameterDefinitions({ date_zoom: shadowedDateZoom }, [
                'date_zoom',
            ]),
        ).toEqual({ date_zoom: shadowedDateZoom });
    });

    it('returns nothing when there are no references', () => {
        expect(
            getReferencedParameterDefinitions({ region }, undefined),
        ).toEqual({});
        expect(getReferencedParameterDefinitions({ region }, [])).toEqual({});
    });
});
