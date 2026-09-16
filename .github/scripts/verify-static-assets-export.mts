import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, statfsSync } from 'node:fs';
import { prepareAssets, upload } from './upload-static-assets.mts';

const image = 'us-docker.pkg.dev/lightdash-containers/lightdash/lightdash:2.228.0-commercial';
const imageDigest = 'sha256:9182cda5ef892d4247f08c8c05fd06ebec63c52da64d035121e8a933168491fa';
const publication = createHash('sha256').update(image).digest('hex');
const bucket = 'lightdash-static-assets-staging';
const prefix = `verification/pr-29320/${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
const destination = `gs://${bucket}/${prefix}`;
const run = (command: string, args: string[]) => execFileSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const expected = JSON.parse(run('gcloud', ['storage', 'cat', `gs://${bucket}/releases/${publication}.json`]));
const assets = prepareAssets('retained-static-assets/assets');
assert.equal(expected.image, image);
assert.deepEqual(assets, expected.assets);
console.log(`PASS: ${assets.length} exported assets match the existing release manifest byte-for-byte.`);
try {
    upload({ image, imageDigest, directory: 'retained-static-assets/assets', buckets: [bucket], run: (command, args) => {
        assert.equal(command, 'gsutil');
        const target = args.at(-1);
        assert.ok(target?.startsWith(`gs://${bucket}/`));
        return run(command, [...args.slice(0, -1), target.replace(`gs://${bucket}/`, `${destination}/`)]);
    } });
    const manifest = JSON.parse(run('gcloud', ['storage', 'cat', `${destination}/releases/${publication}.json`]));
    assert.deepEqual(manifest, { image, imageDigest, assets });
    mkdirSync('downloaded-verification');
    run('gsutil', ['-m', 'cp', '-r', `${destination}/assets`, 'downloaded-verification/']);
    assert.deepEqual(prepareAssets('downloaded-verification/assets'), assets);
    const assetMetadata = JSON.parse(run('gcloud', ['storage', 'objects', 'describe', `${destination}/assets/${assets[0].path}`, '--format=json']));
    const manifestMetadata = JSON.parse(run('gcloud', ['storage', 'objects', 'describe', `${destination}/releases/${publication}.json`, '--format=json']));
    assert.equal(assetMetadata.cache_control, 'public, max-age=31536000, immutable');
    assert.equal(manifestMetadata.cache_control, 'no-store');
    console.log(`PASS: ${assets.length} uploaded assets downloaded and SHA-256 verified; manifest and cache headers verified.`);
} finally {
    run('gsutil', ['-m', 'rm', '-r', `${destination}/`]);
    console.log(`Cleaned test prefix: ${destination}`);
}
const samples = readFileSync('/tmp/assets-disk-samples', 'utf8').trim().split('\n').map(Number);
console.log(JSON.stringify({ baselineFreeBytes: samples[0], minimumFreeBytes: Math.min(...samples), peakDiskGrowthBytes: samples[0] - Math.min(...samples), sampleCount: samples.length, finalFreeBytes: statfsSync('.').bavail * statfsSync('.').bsize }));
assert.equal(run('docker', ['image', 'ls', '--quiet']), readFileSync('/tmp/initial-docker-images', 'utf8').trim());
console.log('PASS: no application image loaded into runner Docker storage.');
