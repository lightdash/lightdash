const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { prepare } = require('./semantic-release-safety-plugin');

async function run() {
    const rendered = { nextRelease: { notes: 'Existing notes' }, logger: console };
    await prepare({}, rendered);
    assert.match(rendered.nextRelease.notes, /Existing notes/);
    assert.match(rendered.nextRelease.notes, /## Upgrade safety/);
    assert.match(rendered.nextRelease.notes, /Safety unknown/);

    const previousDirectory = process.cwd();
    const temporaryDirectory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'release-safety-notes-test-'),
    );
    const errors = [];
    try {
        process.chdir(temporaryDirectory);
        const degraded = {
            nextRelease: { notes: '' },
            logger: { error: (message) => errors.push(message) },
        };
        await prepare({}, degraded);
        assert.match(degraded.nextRelease.notes, /Safety unknown/);
        assert.match(degraded.nextRelease.notes, /Recreate/);
        assert.strictEqual(errors.length, 1);
    } finally {
        process.chdir(previousDirectory);
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
}

run()
    .then(() => console.log('semantic-release-safety-plugin: all tests passed'))
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
