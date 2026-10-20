import {
    DbtError,
    SupportedDbtVersions,
    type DbtExternalModelNode,
    type DbtLog,
} from '@lightdash/common';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    DBT_EXTERNAL_NODES_PLUGIN_FILENAME,
    DBT_EXTERNAL_NODES_PLUGIN_SOURCE,
    dbtSupportsExternalNodes,
    getMissingDbtNodeReferences,
    parseMissingDbtNodeReferences,
    withCrossSourceRefsHint,
    writeDbtExternalNodesPlugin,
} from './dbtExternalNodes';

const missing = (model: string, project: string) =>
    `depends on a node named '${model}' in package or project '${project}' which was not found`;

describe('external dbt nodes', () => {
    it('writes an importable plugin and its model payload', async () => {
        const directory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'external-nodes-test-'),
        );
        const nodes: DbtExternalModelNode[] = [
            {
                name: 'orders',
                package_name: 'upstream',
                identifier: 'orders_table',
                schema: 'public',
                database: 'warehouse',
                relation_name: 'warehouse.public.orders_table',
                version: 2,
                latest_version: 2,
                access: 'public',
                depends_on_nodes: [],
            },
        ];
        try {
            const environment = await writeDbtExternalNodesPlugin(
                directory,
                nodes,
            );
            expect(environment.PYTHONPATH).toBe(
                path.join(directory, 'dbt_external_nodes'),
            );
            expect(
                await fs.readFile(
                    path.join(
                        environment.PYTHONPATH,
                        DBT_EXTERNAL_NODES_PLUGIN_FILENAME,
                    ),
                    'utf8',
                ),
            ).toBe(DBT_EXTERNAL_NODES_PLUGIN_SOURCE);
            expect(
                await fs.readFile(
                    environment.LIGHTDASH_DBT_EXTERNAL_NODES,
                    'utf8',
                ),
            ).toBe(JSON.stringify(nodes));
        } finally {
            await fs.rm(directory, { recursive: true, force: true });
        }
    });
    it('parses every missing reference and ignores unrelated output', () => {
        expect(
            parseMissingDbtNodeReferences(missing('orders', 'upstream')),
        ).toEqual([
            { model: 'orders', packageName: 'upstream', version: null },
        ]);
        expect(
            parseMissingDbtNodeReferences(
                `${missing('orders', 'upstream')}\n${missing('users', 'shared')}`,
            ),
        ).toEqual([
            { model: 'orders', packageName: 'upstream', version: null },
            { model: 'users', packageName: 'shared', version: null },
        ]);
        expect(
            parseMissingDbtNodeReferences(
                "Model 'model.analytics.uses_versioned' depends on a node named 'dim_product' with version '2' in package or project 'access_upstream' which was not found",
            ),
        ).toEqual([
            {
                model: 'dim_product',
                packageName: 'access_upstream',
                version: '2',
            },
        ]);
        expect(
            parseMissingDbtNodeReferences('Compilation Error: invalid SQL'),
        ).toEqual([]);
    });
    it('reads missing references from messages and dbt logs without duplicates', () => {
        const error = new DbtError(missing('orders', 'upstream'), [
            { info: { msg: missing('users', 'shared') } } as DbtLog,
            { info: { msg: missing('orders', 'upstream') } } as DbtLog,
        ]);
        expect(getMissingDbtNodeReferences(error)).toEqual([
            { model: 'orders', packageName: 'upstream', version: null },
            { model: 'users', packageName: 'shared', version: null },
        ]);
        expect(
            getMissingDbtNodeReferences(
                new Error(missing('orders', 'upstream')),
            ),
        ).toHaveLength(1);
        expect(getMissingDbtNodeReferences(null)).toEqual([]);
    });
    it.each(Object.values(SupportedDbtVersions))(
        'checks plugin support for %s',
        (version) => {
            expect(dbtSupportsExternalNodes(version)).toBe(
                ![
                    SupportedDbtVersions.V1_4,
                    SupportedDbtVersions.V1_5,
                ].includes(version),
            );
        },
    );
});

it('keeps distinct missing versions and supports both dbt version positions', () => {
    const error = new DbtError(
        [
            "depends on a node named 'leaf_a' with version '1' in package or project 'ring_0' which was not found",
            "depends on a node named 'leaf_a' in package or project 'ring_0' with version '2' which was not found",
            "depends on a node named 'leaf_a' with version '1' in package or project 'ring_0' which was not found",
        ].join('\n'),
    );
    expect(parseMissingDbtNodeReferences(error.message)).toHaveLength(2);
    expect(getMissingDbtNodeReferences(error)).toEqual([
        { model: 'leaf_a', packageName: 'ring_0', version: '1' },
        { model: 'leaf_a', packageName: 'ring_0', version: '2' },
    ]);
});

it('parses one-argument missing refs with and without a version', () => {
    expect(
        parseMissingDbtNodeReferences(
            "depends on a node named 'orders' which was not found\ndepends on a node named 'items' with version '2' which was not found",
        ),
    ).toEqual([
        { packageName: null, model: 'orders', version: null },
        { packageName: null, model: 'items', version: '2' },
    ]);
});

it('keeps the disabled error unchanged for a missing one-argument local ref', () => {
    const error = new DbtError(
        "depends on a node named 'local_missing' which was not found",
    );
    const before = error.message;
    expect(withCrossSourceRefsHint(error, false)).toBe(error);
    expect(error.message).toBe(before);
});
