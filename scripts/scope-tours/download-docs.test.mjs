import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
    mkdtempSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { downloadDocs } from './download-docs.mjs';

const revision = 'a'.repeat(40);

test('extracts a pinned docs archive without persisting credentials', async () => {
    const temporary = mkdtempSync(path.join(tmpdir(), 'scope-tours-download-'));
    try {
        const source = path.join(temporary, 'mintlify-docs-revision');
        const destination = path.join(temporary, 'docs');
        mkdirSync(source);
        mkdirSync(destination);
        writeFileSync(path.join(source, 'docs.json'), '{"navigation":[]}');
        const archive = execFileSync('tar', [
            '-czf',
            '-',
            '-C',
            temporary,
            path.basename(source),
        ]);
        const requests = [];

        await downloadDocs(
            revision,
            'private-read-token',
            destination,
            async (url, options) => {
                requests.push({ url, options });
                return new Response(archive);
            },
        );

        assert.equal(requests.length, 1);
        assert.equal(
            requests[0].url,
            `https://api.github.com/repos/lightdash/mintlify-docs/tarball/${revision}`,
        );
        assert.equal(
            requests[0].options.headers.Authorization,
            'Bearer private-read-token',
        );
        assert.equal(
            readFileSync(path.join(destination, 'docs.json'), 'utf8'),
            '{"navigation":[]}',
        );
        assert.deepEqual(readdirSync(destination), ['docs.json']);
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});

test('requires a pinned revision and credentials before requesting docs', async () => {
    const noRequest = () => assert.fail('should not request docs');
    await assert.rejects(
        downloadDocs('main', 'token', '/unused', noRequest),
        /40-character commit SHA/,
    );
    await assert.rejects(
        downloadDocs(revision, '', '/unused', noRequest),
        /read token is empty/,
    );
});

test('reports failed requests without exposing a response body or token', async () => {
    await assert.rejects(
        downloadDocs(
            revision,
            'private-token',
            '/unused',
            async () => new Response('private-token', { status: 403 }),
        ),
        { message: 'Docs archive download failed (HTTP 403)' },
    );
});

test('rejects an invalid archive instead of allowing a stale frontend build', async () => {
    const temporary = mkdtempSync(path.join(tmpdir(), 'scope-tours-download-'));
    try {
        await assert.rejects(
            downloadDocs(
                revision,
                'token',
                temporary,
                async () => new Response('invalid archive'),
            ),
            /Docs archive extraction failed/,
        );
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});
