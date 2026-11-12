import { isExploreError, type DbtManifest } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { mockOrdersExplore } from '../ai/utils/validationExplore.mock';
import {
    findChangedModels,
    findLiveTableLocations,
    markNewModels,
    pointManifestAtLiveTables,
} from './dbtTryOut';

const manifest = (): DbtManifest => {
    const nodes = {
        'model.shop.orders': {
            unique_id: 'model.shop.orders',
            resource_type: 'model',
            package_name: 'shop',
            name: 'orders',
            database: 'placeholder',
            schema: 'placeholder',
            relation_name: '"placeholder"."placeholder"."orders"',
            original_file_path: 'models/orders.sql',
            patch_path: 'shop://models/schema.yml',
        },
        'model.shop.refunds': {
            unique_id: 'model.shop.refunds',
            resource_type: 'model',
            package_name: 'shop',
            name: 'refunds',
            database: 'placeholder',
            schema: 'placeholder',
            original_file_path: 'models/refunds.sql',
        },
        'model.utils.calendar': {
            unique_id: 'model.utils.calendar',
            resource_type: 'model',
            package_name: 'utils',
            name: 'calendar',
            original_file_path: 'models/refunds.sql',
        },
        'test.shop.not_null': {
            unique_id: 'test.shop.not_null',
            resource_type: 'test',
        },
    };
    return {
        nodes,
        metadata: {
            dbt_schema_version:
                'https://schemas.getdbt.com/dbt/manifest/v12.json',
            generated_at: '2026-11-12T00:00:00Z',
            adapter_type: 'postgres',
            project_name: 'shop',
        },
        metrics: {},
        docs: {},
    };
};

describe('trying a dbt change before its preview', () => {
    it('points the models live has at their live tables and names the new ones', () => {
        const live = findLiveTableLocations([mockOrdersExplore]);
        const pointed = pointManifestAtLiveTables(manifest(), live);
        expect(pointed.manifest.nodes['model.shop.orders']).toMatchObject({
            database: 'test_db',
            schema: 'public',
            relation_name: 'orders',
        });
        expect(pointed.manifest.nodes['model.shop.refunds']).toMatchObject({
            schema: 'placeholder',
        });
        expect(pointed.manifest.nodes['test.shop.not_null']).toEqual({
            unique_id: 'test.shop.not_null',
            resource_type: 'test',
        });
        expect([...pointed.newModels]).toEqual(['refunds', 'calendar']);
    });

    it('turns the explore of a new model into one that says why it cannot be tried', () => {
        const [kept] = markNewModels([mockOrdersExplore], new Set(['refunds']));
        const [marked] = markNewModels(
            [mockOrdersExplore],
            new Set(['orders']),
        );
        expect(kept).toBe(mockOrdersExplore);
        expect(isExploreError(marked)).toBe(true);
    });

    it('names the models whose SQL or YAML a commit changed', () => {
        expect(findChangedModels(manifest(), ['models/schema.yml'])).toEqual([
            'orders',
        ]);
        expect(
            findChangedModels(manifest(), ['models/refunds.sql', 'README.md']),
        ).toEqual(['refunds']);
    });
});
