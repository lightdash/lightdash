import * as assert from 'assert';
import * as fs from 'fs';
import Ajv from 'ajv';

const ajv = new Ajv({ strict: true, validateFormats: false });
const artifactSchema = JSON.parse(
    fs.readFileSync('scripts/release-safety.schema.json', 'utf-8'),
);
const indexSchema = JSON.parse(
    fs.readFileSync('scripts/release-safety-index.schema.json', 'utf-8'),
);
const artifact = JSON.parse(fs.readFileSync('release-safety.json', 'utf-8'));
const index = JSON.parse(
    fs.readFileSync('release-safety-index.json', 'utf-8'),
);

const validateArtifact = ajv.compile(artifactSchema);
const validateIndex = ajv.compile(indexSchema);
assert.strictEqual(
    validateArtifact(artifact),
    true,
    JSON.stringify(validateArtifact.errors),
);
assert.strictEqual(
    validateIndex(index),
    true,
    JSON.stringify(validateIndex.errors),
);
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

console.log('release-safety-schema: all tests passed');
