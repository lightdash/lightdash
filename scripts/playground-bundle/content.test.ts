import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playgroundContent } from './content';

const shippedJson = readFileSync(
    new URL(
        '../../packages/backend/assets/playground/content.json',
        import.meta.url,
    ),
    'utf8',
);
const shipped = JSON.parse(shippedJson);

// Rebuilding the bundle must preserve the samples every University lesson
// depends on, including prebuilt app files and the completed research report.
assert.deepEqual(
    JSON.parse(JSON.stringify(playgroundContent)),
    shipped,
    'Playground content sources and shipped bundle differ; update both together',
);
assert.equal(
    `${JSON.stringify(playgroundContent)}\n`,
    shippedJson,
    'Content serialization must preserve the shipped bundle bytes',
);

const learnBundle = JSON.parse(
    readFileSync(
        new URL(
            '../../packages/backend/assets/learn/jaffle-dbt.json',
            import.meta.url,
        ),
        'utf8',
    ),
) as { version: number; files: { path: string; content: string }[] };
const shippedExplores = JSON.parse(
    readFileSync(
        new URL(
            '../../packages/backend/assets/playground/explores.json',
            import.meta.url,
        ),
        'utf8',
    ),
) as { name: string }[];
const modelNames = new Set(
    learnBundle.files
        .filter((f) => f.path.startsWith('models/') && f.path.endsWith('.sql'))
        .map((f) => f.path.slice(f.path.lastIndexOf('/') + 1, -'.sql'.length)),
);
// A shipped explore need not have its own model file: Lightdash's dbt yaml spec
// lets a model's `meta.spotlight`/`explores` config define additional explores
// (a `meta.explores:` block) that reuse the parent model's table and joins.
// Detect those by scanning bundled model yaml files for mapping keys.
const yamlExploreNames = new Set(
    learnBundle.files
        .filter((f) => f.path.startsWith('models/') && f.path.endsWith('.yml'))
        .flatMap((f) => f.content.split(/\r?\n/))
        .flatMap((line) => {
            const match = /^([a-z0-9_]+):$/.exec(line.trim());
            return match ? [match[1]] : [];
        }),
);
for (const explore of shippedExplores) {
    assert.ok(
        modelNames.has(explore.name) || yamlExploreNames.has(explore.name),
        `Learn bundle is missing a model for shipped explore "${explore.name}"; run pnpm build:learn-bundle`,
    );
}
assert.equal(learnBundle.version, 1);
assert.ok(
    learnBundle.files.every((f) => !f.path.endsWith('.py')),
    'Learn bundle must not ship Python files',
);

console.log('Playground content source matches the complete shipped bundle');
