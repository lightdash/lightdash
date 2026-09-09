import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildConcepts, extractSection } from './lib';
const root = mkdtempSync(path.join(tmpdir(), 'concept-lessons-'));
writeFileSync(
    path.join(root, 'example.mdx'),
    '---\ntitle: Example\n---\n## Read this\n\nA **real** paragraph. [Child](#child) [Other](other.mdx#section)\n\n<Frame>\n![image](/image.png)\n</Frame>\n\n### Child\n\nChild detail.\n\n## Next\n\nNot selected.',
);
assert.equal(
    extractSection('## Read this\n\nBody\n## Next\nOther', 'Read this'),
    'Body',
);
assert.throws(() => extractSection('## Wrong\nBody', 'Missing'), /Missing/);
const manifest = [
    {
        scopes: ['view:Example'],
        title: 'Read examples',
        sources: [{ file: 'example.mdx', heading: 'Read this' }],
    },
];
const result = buildConcepts(root, manifest);
assert.match(result['view:Example'].sections[0].body, /real/);
assert.match(
    result['view:Example'].sections[0].body,
    /https:\/\/docs.lightdash.com\/example#child/,
);
assert.match(
    result['view:Example'].sections[0].body,
    /https:\/\/docs.lightdash.com\/other#section/,
);
assert.match(result['view:Example'].sections[0].body, /Child detail/);
assert.doesNotMatch(
    result['view:Example'].sections[0].body,
    /Frame|image.png|Not selected/,
);
assert.equal(
    result['view:Example'].sections[0].sourceUrl,
    'https://docs.lightdash.com/example#read-this',
);
assert.throws(
    () => buildConcepts(root, [...manifest, ...manifest]),
    /Duplicate/,
);
assert.throws(
    () =>
        buildConcepts(root, [
            {
                ...manifest[0],
                sources: [{ file: 'missing.mdx', heading: 'Absent' }],
            },
        ]),
    /ENOENT/,
);
console.log('Concept generator fixture tests passed');
