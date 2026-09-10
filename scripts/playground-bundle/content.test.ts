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
console.log('Playground content source matches the complete shipped bundle');
