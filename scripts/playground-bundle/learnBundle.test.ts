import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    collectLearnBundle,
    isLearnBundlePath,
    serializeLearnBundle,
    truncateCsvToHeader,
} from './learnBundle';

const main = async () => {
    assert.equal(
        truncateCsvToHeader('id,name\n1,a\n2,b\n'),
        'id,name\n',
        'keeps only the header line',
    );
    assert.equal(truncateCsvToHeader('id,name'), 'id,name\n');
    assert.equal(truncateCsvToHeader(''), '');

    assert.equal(isLearnBundlePath('dbt_project.yml'), true);
    assert.equal(isLearnBundlePath('lightdash.config.yml'), true);
    assert.equal(isLearnBundlePath('models/orders.yml'), true);
    assert.equal(isLearnBundlePath('models/fanouts_examples/a.sql'), true);
    assert.equal(isLearnBundlePath('models/docs.md'), true);
    assert.equal(isLearnBundlePath('macros/x.sql'), true);
    assert.equal(isLearnBundlePath('data/raw_orders.csv'), true);
    assert.equal(isLearnBundlePath('data/seeds.yml'), true);
    assert.equal(isLearnBundlePath('scripts/generate.py'), false);
    assert.equal(isLearnBundlePath('models/model.py'), false);
    assert.equal(isLearnBundlePath('charts/a.yml'), false);
    assert.equal(isLearnBundlePath('docker/compose.yml'), false);
    assert.equal(isLearnBundlePath('etc/x'), false);
    assert.equal(isLearnBundlePath('target/manifest.json'), false);
    assert.equal(isLearnBundlePath('README.md'), false);
    assert.equal(isLearnBundlePath('CLAUDE.md'), false);
    assert.equal(isLearnBundlePath('LICENSE'), true);

    const root = await mkdtemp(path.join(tmpdir(), 'learn-bundle-'));
    try {
        await mkdir(path.join(root, 'models', 'nested'), { recursive: true });
        await mkdir(path.join(root, 'data'), { recursive: true });
        await mkdir(path.join(root, 'charts'), { recursive: true });
        await writeFile(path.join(root, 'dbt_project.yml'), 'name: jaffle\n');
        await writeFile(path.join(root, 'models', 'z.sql'), 'select 1\n');
        await writeFile(
            path.join(root, 'models', 'nested', 'a.yml'),
            'version: 2\n',
        );
        await writeFile(path.join(root, 'models', 'skip.py'), 'print(1)\n');
        await writeFile(path.join(root, 'data', 'raw.csv'), 'id\n1\n2\n');
        await writeFile(path.join(root, 'charts', 'c.yml'), 'x: 1\n');

        const bundle = await collectLearnBundle(root);
        assert.equal(bundle.version, 1);
        assert.deepEqual(
            bundle.files.map((f) => f.path),
            [
                'data/raw.csv',
                'dbt_project.yml',
                'models/nested/a.yml',
                'models/z.sql',
            ],
            'sorted by path, filtered, POSIX separators',
        );
        assert.equal(
            bundle.files.find((f) => f.path === 'data/raw.csv')?.content,
            'id\n',
        );

        const first = serializeLearnBundle(bundle);
        const second = serializeLearnBundle(await collectLearnBundle(root));
        assert.equal(first, second, 'serialization is deterministic');
        assert.ok(first.endsWith('\n'));
        assert.deepEqual(JSON.parse(first), bundle);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
    console.log('learnBundle ok');
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
