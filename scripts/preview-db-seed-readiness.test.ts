import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const root = process.cwd();
const readinessSql = fs.readFileSync(
    path.join(root, 'scripts/preview-db-seed-ready.sql'),
    'utf8',
);
const snapshotScript = fs.readFileSync(
    path.join(root, 'scripts/preview-db-snapshot.sh'),
    'utf8',
);

for (const sentinel of [
    "to_regclass('jaffle.orders') IS NOT NULL",
    "email = 'demo@lightdash.com'",
    'FROM catalog_search',
    "project_uuid = '3675b69e-8324-4110-bdca-059031aa8da3'",
    't.yaml_reference IS NOT NULL',
]) {
    assert.ok(readinessSql.includes(sentinel), `missing sentinel: ${sentinel}`);
}

assert.ok(snapshotScript.includes('preview-db-seed-ready.sql'));

console.log('preview-db-seed-readiness: all tests passed');
