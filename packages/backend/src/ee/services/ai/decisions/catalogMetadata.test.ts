import { DimensionType, FilterOperator, TimeFrames } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { validExplore } from '../../../../services/ProjectService/ProjectService.mock';
import { executeGetMetadata } from '../tools/getMetadata';
import { buildFieldIndex } from '../tools/grepFieldsIndex';
import { prepareCatalogMetadata } from './catalogMetadata';

const fixture = () => {
    const explore = structuredClone(validExplore);
    explore.tables.a.dimensions.dim1.description =
        'A complete business definition, including exclusions.';
    explore.tables.a.dimensions.dim1.caseSensitive = false;
    explore.tables.a.requiredFilters = [
        {
            id: 'required-filter',
            target: { fieldRef: 'dim1' },
            operator: FilterOperator.EQUALS,
            values: ['allowed'],
        },
    ];
    return explore;
};

describe('preloaded catalog metadata', () => {
    it('spends the metadata budget on the selected source before equivalent joined copies', () => {
        const explores = ['events', 'billing', 'usage'].map((name) => ({
            ...fixture(),
            name,
        }));
        const fields = buildFieldIndex(explores);
        const result = prepareCatalogMetadata(
            fields,
            explores,
            {},
            new Map(fields.map((field) => [field.path, -0.99])),
            new Map([
                ['events', -0.01],
                ['billing', -0.02],
                ['usage', -0.97],
            ]),
        )!;
        expect(result).toContain('Explore: usage');
        expect(result.indexOf('Explore: usage')).toBeLessThan(
            result.indexOf('Explore: billing'),
        );
        expect(result).not.toContain('Explore: events');
        expect(fields[0].exploreName).toBe('events');
    });

    it('omits low-relevance definitions without dropping discovery candidates or truncating rules', () => {
        const explore = fixture();
        explore.tables.a.metrics.met1.description =
            'Revenue after refunds; exclude voided payments.';
        explore.tables.b.dimensions.dim1.description =
            'Unrelated device description.';
        const fields = buildFieldIndex([explore]);
        const before = structuredClone(fields);
        const ranks = new Map(
            fields.map((field) => [
                field.path,
                field.kind === 'metric' ? -0.85 : -0.2,
            ]),
        );
        const result = prepareCatalogMetadata(fields, [explore], {}, ranks);
        expect(result).toContain(
            'Revenue after refunds; exclude voided payments.',
        );
        expect(result).not.toContain('Unrelated device description.');
        expect(result).not.toContain('A complete business definition');
        expect(result).toContain('required a_dim1');
        expect(fields).toEqual(before);
        expect(
            prepareCatalogMetadata(fields, [explore], {}, new Map()),
        ).toBeNull();
    });

    it('preserves the exact tool definitions, filter semantics and joined fields', () => {
        const explore = fixture();
        const fields = buildFieldIndex([explore]);
        const result = prepareCatalogMetadata(fields, [explore], {});
        const expected = executeGetMetadata(
            {
                requests: [
                    { type: 'explore', exploreIds: [explore.name] },
                    {
                        type: 'field',
                        fields: fields.map((f) => ({
                            exploreId: explore.name,
                            fieldId: f.path.split('/')[1],
                        })),
                    },
                ],
            },
            {
                availableExplores: [explore],
                projectParameterDefinitions: {},
                includeSourceDetails: true,
            },
            { includeFieldLists: false },
        );
        expect(result).toContain(expected.result);
        expect(result).toContain('case-sensitive filters: false');
        expect(result).toContain('required a_dim1');
        expect(result).toContain('from joined table "b"');
    });

    it('does not repeat the whole field inventory in a selected-field preload', () => {
        const explore = fixture();
        const selected = buildFieldIndex([explore]).filter(
            (field) => field.path === `${explore.name}/a_dim1`,
        );
        explore.tables.a.dimensions.unrelated_inventory_field = {
            ...explore.tables.a.dimensions.dim1,
            name: 'unrelated_inventory_field',
            description: 'Unrelated definition.',
        };
        const preload = prepareCatalogMetadata(selected, [explore], {});
        const full = executeGetMetadata(
            { requests: [{ type: 'explore', exploreIds: [explore.name] }] },
            {
                availableExplores: [explore],
                projectParameterDefinitions: {},
            },
        );
        expect(full.result).toContain('a_unrelated_inventory_field');
        expect(preload).not.toContain('a_unrelated_inventory_field');
        expect(preload).toContain(
            'A complete business definition, including exclusions.',
        );
        expect(preload).toContain('required a_dim1');
        expect(preload).toContain('Full field inventories are not included');
    });

    it('includes only authorized, visible definitions', () => {
        const explore = fixture();
        const fields = buildFieldIndex([explore]);
        expect(prepareCatalogMetadata(fields, [], {})).toBeNull();
        explore.tables.a.dimensions.dim1.hidden = true;
        const result = prepareCatalogMetadata(fields, [explore], {});
        expect(result).not.toContain('A complete business definition');
        expect(result).not.toContain('not found');
    });

    it('brings the declared default date fields along with a metric', () => {
        const explore = fixture();
        explore.tables.a.dimensions.dim1.type = DimensionType.DATE;
        explore.tables.a.dimensions.dim1_month = {
            ...explore.tables.a.dimensions.dim1,
            name: 'dim1_month',
            label: 'Order month',
        };
        explore.tables.a.metrics.met1.defaultTimeDimension = {
            field: 'dim1',
            interval: TimeFrames.MONTH,
        };
        const fields = buildFieldIndex([explore]).filter(
            (field) => field.kind === 'metric',
        );
        const result = prepareCatalogMetadata(
            fields,
            [explore],
            {},
            new Map(fields.map((field) => [field.path, -0.99])),
        );
        expect(result).toContain(
            `${explore.name}/a_dim1_month  [dimension date]`,
        );
        expect(result).toContain(`${explore.name}/a_dim1  [dimension date]`);
        expect(result?.match(/label: Order month/g)).toHaveLength(1);
    });

    it('bounds metadata by whole definitions and limits explores', () => {
        const explores = Array.from({ length: 3 }, (_, i) => {
            const explore = fixture();
            explore.name = `explore_${i}`;
            explore.tables.a.dimensions = Object.fromEntries(
                Array.from({ length: 20 }, (_field, n) => [
                    `field_${n}`,
                    {
                        ...explore.tables.a.dimensions.dim1,
                        name: `field_${n}`,
                        description: `${'x'.repeat(1800)} END_DEFINITION_${n}`,
                    },
                ]),
            );
            return explore;
        });
        const result = prepareCatalogMetadata(
            buildFieldIndex(explores),
            explores,
            {},
        )!;
        expect(result.length).toBeLessThan(12_500);
        expect(result).not.toContain('Explore: explore_2');
        expect(result).not.toContain('...(truncated)');
        expect(result.match(/END_DEFINITION_\d+/g)?.length).toBeGreaterThan(0);
        expect(result.match(/description: x/g)?.length).toBe(
            result.match(/END_DEFINITION_\d+/g)?.length,
        );
    });

    it('does not claim a preload when every field is unavailable', () => {
        const explore = fixture();
        const fields = buildFieldIndex([explore]).map((f) => ({
            ...f,
            path: `${f.exploreName}/missing`,
        }));
        expect(prepareCatalogMetadata(fields, [explore], {})).toBeNull();
    });
});
