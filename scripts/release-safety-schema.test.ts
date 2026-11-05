import * as assert from 'assert';
import * as fs from 'fs';
import Ajv from 'ajv';
import { parseBreakingChangeDeclarationsFile } from './release-safety-declarations';
import { buildMarker } from './gen-release-safety';

const ajv = new Ajv({ strict: true, validateFormats: false });
const artifactSchema = JSON.parse(
    fs.readFileSync('scripts/release-safety.schema.json', 'utf-8'),
);
const indexSchema = JSON.parse(
    fs.readFileSync(
        'packages/cli/src/releaseSafety/release-safety-index.schema.json',
        'utf-8',
    ),
);
const artifact = JSON.parse(fs.readFileSync('release-safety.json', 'utf-8'));
const index = JSON.parse(
    fs.readFileSync('release-safety-index.json', 'utf-8'),
);

const validateArtifact = ajv.compile(artifactSchema);
const validateIndex = ajv.compile(indexSchema);
const generatedArtifact = buildMarker({
    version: '1.121.0',
    previousVersion: '1.120.1',
    releaseDate: '2026-08-11T00:00:00.000Z',
    migrations: {
        present: false,
        count: 0,
        files: [],
        ee: false,
        deletedHistorical: [],
    },
    migrationDetails: [],
    restApi: {
        checked: true,
        breaking: true,
        changes: ['DELETE /api/v1/example — endpoint removed'],
        breakingCount: 1,
        advisories: ['GET /api/v1/example — response enum value added'],
        advisoryCount: 1,
    },
    mcpApi: {
        checked: true,
        breaking: false,
        changes: [],
        breakingCount: 0,
        advisories: [],
        advisoryCount: 0,
    },
    config: { checked: true, breaking: false, changes: [] },
});
assert.strictEqual(
    validateArtifact(artifact),
    true,
    JSON.stringify(validateArtifact.errors),
);
assert.strictEqual(
    validateArtifact(generatedArtifact),
    true,
    JSON.stringify(validateArtifact.errors),
);
assert.strictEqual(
    validateIndex(index),
    true,
    JSON.stringify(validateIndex.errors),
);
const floorIndex = index.entries.findIndex(
    (entry: { version: string }) => entry.version === '0.1893.0',
);
const releaseIndex = index.entries.findIndex(
    (entry: { version: string }) => entry.version === '1.121.0',
);
assert.notStrictEqual(floorIndex, -1);
assert.ok(releaseIndex > floorIndex);
for (let entryIndex = floorIndex + 1; entryIndex <= releaseIndex; entryIndex += 1) {
    assert.strictEqual(
        index.entries[entryIndex].previousVersion,
        index.entries[entryIndex - 1].version,
    );
}
for (const version of [
    '1.116.0',
    '1.116.1',
    '1.117.0',
    '1.118.0',
    '1.119.0',
    '1.120.0',
    '1.120.1',
]) {
    const entry = index.entries.find(
        (candidate: { version: string }) => candidate.version === version,
    );
    assert.strictEqual(entry?.backfilled, true);
}
assert.match(artifactSchema.description, /unknown.*unsafe/i);
assert.match(artifactSchema.description, /artifact shrinks/i);
assert.match(
    artifactSchema.properties.compatibility.properties.recommendedStrategy
        .description,
    /Derived.*gate on rollingUpdateSafe/i,
);
assert.strictEqual('capabilities' in artifactSchema.properties, false);
assert.strictEqual(
    'notes' in artifactSchema.properties.compatibility.properties,
    false,
);
assert.strictEqual(
    'transaction' in
        artifactSchema.properties.migrations.properties.files.items.properties,
    false,
);

const advisory = {
    id: 'internal-operation',
    reason: 'The flag is off by default on Cloud and self-hosted.',
    requiredStop: false,
    impact: {
        kind: 'no-external-callers',
        featureFlag: 'agent-identity',
        covers: { rest: ['POST /x'], mcp: [] },
    },
};
assert.strictEqual(
    validateArtifact({ ...generatedArtifact, declaredAdvisories: [advisory] }),
    true,
    JSON.stringify(validateArtifact.errors),
);
for (const entry of [
    { ...advisory, requiredStop: true },
    {
        ...advisory,
        migration:
            'packages/backend/src/database/migrations/20260819000000_break.ts',
    },
    { ...advisory, extra: true },
    { ...advisory, impact: { ...advisory.impact, extra: true } },
    {
        ...advisory,
        impact: {
            ...advisory.impact,
            firstPartyOnly:
                'Only the Lightdash settings page calls this operation.',
        },
    },
]) {
    assert.strictEqual(
        validateArtifact({ ...generatedArtifact, declaredAdvisories: [entry] }),
        false,
    );
}
const { declaredAdvisories: ignoredAdvisories, ...oldArtifact } =
    generatedArtifact;
assert.strictEqual(validateArtifact(oldArtifact), true);

const validateDeclarations = ajv.compile(JSON.parse(
    fs.readFileSync('scripts/release-safety-declarations.schema.json', 'utf-8'),
));
for (const [reason, expected] of [
    ['The UI 😀 calls this API', false],
    ['The UI 😀 calls this API.', true],
    ['  The UI 😀 calls this API.  ', true],
    ['The  UI 😀 calls this API', false],
    ['The UI İ calls this API', false],
    ['<operator-facing reason>', false],
    ['abcdefghijklmnopqrstuvwx', false],
] as const) {
    for (const field of ['reason', 'firstPartyOnly'] as const) {
        const entry = field === 'reason'
            ? { ...advisory, reason }
            : { ...advisory, impact: {
                kind: advisory.impact.kind,
                firstPartyOnly: reason,
                covers: advisory.impact.covers,
            } };
        const { id, ...declaration } = entry;
        const registry = { declarations: { [id]: declaration } };
        const loaded = parseBreakingChangeDeclarationsFile(JSON.stringify(registry));
        assert.strictEqual(loaded.diagnostics.length === 0, expected, `loader ${field}: ${reason}`);
        assert.strictEqual(validateDeclarations(registry), expected, `declarations schema ${field}: ${reason}`);
        assert.strictEqual(
            validateArtifact({ ...generatedArtifact, declaredAdvisories: [entry] }),
            expected,
            `marker schema ${field}: ${reason}`,
        );
    }
}
assert.strictEqual(Array.from('The UI 😀 calls this API').length, 23);

console.log('release-safety-schema: all tests passed');
