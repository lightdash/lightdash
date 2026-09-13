import type { LearnWorkspaceFileSummary } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildFileTree } from './buildFileTree';

describe('buildFileTree', () => {
    it('nests a file under a synthesised directory node', () => {
        const files: LearnWorkspaceFileSummary[] = [
            { path: 'models/orders.yml', editable: true },
        ];

        expect(buildFileTree(files)).toEqual([
            {
                name: 'models',
                path: 'models',
                children: [
                    {
                        name: 'orders.yml',
                        path: 'models/orders.yml',
                        editable: true,
                    },
                ],
            },
        ]);
    });

    it('sorts directories before files, each alphabetically', () => {
        const files: LearnWorkspaceFileSummary[] = [
            { path: 'zzz.yml', editable: true },
            { path: 'models/b.yml', editable: true },
            { path: 'aaa.yml', editable: true },
            { path: 'models/a.yml', editable: true },
            { path: 'seeds/config.yml', editable: false },
        ];

        const tree = buildFileTree(files);

        expect(tree.map((node) => node.name)).toEqual([
            'models',
            'seeds',
            'aaa.yml',
            'zzz.yml',
        ]);
        const models = tree.find((node) => node.name === 'models');
        expect(models?.children?.map((node) => node.name)).toEqual([
            'a.yml',
            'b.yml',
        ]);
    });

    it('carries editable only on leaf (file) nodes, not directories', () => {
        const files: LearnWorkspaceFileSummary[] = [
            { path: 'models/orders.yml', editable: false },
        ];

        const [dir] = buildFileTree(files);

        expect(dir.editable).toBeUndefined();
        expect(dir.children?.[0].editable).toBe(false);
    });

    it('merges multiple files under the same directory', () => {
        const files: LearnWorkspaceFileSummary[] = [
            { path: 'models/orders.yml', editable: true },
            { path: 'models/customers.yml', editable: true },
            { path: 'dbt_project.yml', editable: false },
        ];

        const tree = buildFileTree(files);

        expect(tree).toHaveLength(2);
        const models = tree.find((node) => node.name === 'models');
        expect(models?.children?.map((node) => node.path)).toEqual([
            'models/customers.yml',
            'models/orders.yml',
        ]);
        expect(tree.find((node) => node.name === 'dbt_project.yml')).toEqual({
            name: 'dbt_project.yml',
            path: 'dbt_project.yml',
            editable: false,
        });
    });

    it('nests multi-level directories', () => {
        const files: LearnWorkspaceFileSummary[] = [
            { path: 'models/staging/orders.yml', editable: true },
        ];

        const tree = buildFileTree(files);

        expect(tree).toEqual([
            {
                name: 'models',
                path: 'models',
                children: [
                    {
                        name: 'staging',
                        path: 'models/staging',
                        children: [
                            {
                                name: 'orders.yml',
                                path: 'models/staging/orders.yml',
                                editable: true,
                            },
                        ],
                    },
                ],
            },
        ]);
    });
});
