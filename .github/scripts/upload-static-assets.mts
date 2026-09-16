#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const config = {
    cacheControl: 'Cache-Control:public, max-age=31536000, immutable',
    excludedExtensions: new Set(['.map', '.gzip', '.gz', '.br']),
    maxPathLength: 512,
};

type RunCommand = (command: string, args: string[]) => string;
type Asset = { path: string; sha256: string };

const runCommand: RunCommand = (command, args) =>
    execFileSync(command, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
        maxBuffer: 64 * 1024 * 1024,
    }).trim();

const sha256 = (value: string | Buffer): string =>
    createHash('sha256').update(value).digest('hex');

export function prepareAssets(directory: string): Asset[] {
    const walk = (relativeDirectory: string): Asset[] =>
        readdirSync(join(directory, relativeDirectory), { withFileTypes: true })
            .sort((left, right) => left.name.localeCompare(right.name))
            .flatMap((entry) => {
                const relativePath = relativeDirectory
                    ? `${relativeDirectory}/${entry.name}`
                    : entry.name;
                const path = join(directory, relativePath);
                if (entry.isSymbolicLink()) {
                    throw new Error(
                        `Asset symlink is not allowed: ${relativePath}`,
                    );
                }
                if (entry.isDirectory()) {
                    return walk(relativePath);
                }
                if (!entry.isFile()) {
                    return [];
                }
                if (config.excludedExtensions.has(extname(path))) {
                    unlinkSync(path);
                    return [];
                }
                if (
                    relativePath.length > config.maxPathLength ||
                    relativePath
                        .split('/')
                        .some(
                            (part) =>
                                !/^[\w.-]+$/.test(part) ||
                                part === '.' ||
                                part === '..',
                        )
                ) {
                    throw new Error(`Unsupported asset path: ${relativePath}`);
                }
                return [
                    { path: relativePath, sha256: sha256(readFileSync(path)) },
                ];
            });

    const assets = walk('');
    if (!assets.some((asset) => asset.path.endsWith('.js'))) {
        throw new Error(
            'Image contains no JavaScript assets; refusing an empty publication',
        );
    }
    return assets;
}

export function upload({
    image,
    buckets,
    directory,
    imageDigest,
    run = runCommand,
}: {
    image: string;
    buckets: string[];
    directory: string;
    imageDigest: string;
    run?: RunCommand;
}): void {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]+$/.test(image)) {
        throw new Error('Invalid image reference');
    }
    if (
        buckets.length === 0 ||
        buckets.some(
            (bucket) => !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket),
        )
    ) {
        throw new Error('Invalid bucket name');
    }

    if (!/^sha256:[a-f0-9]{64}$/.test(imageDigest)) {
        throw new Error('Invalid image digest');
    }
    if (basename(resolve(directory)) !== 'assets') {
        throw new Error('Asset directory must be named assets');
    }

    const root = mkdtempSync(join(tmpdir(), 'lightdash-static-assets-'));
    try {
        const assets = prepareAssets(directory);
        const manifest = join(root, 'manifest.json');
        writeFileSync(manifest, JSON.stringify({ image, imageDigest, assets }));
        const publication = sha256(image);
        for (const bucket of new Set(buckets)) {
            console.log(
                `Publishing ${assets.length} assets to gs://${bucket}/assets/`,
            );
            // Rewrite shared assets to renew their lifecycle age on each release.
            run('gsutil', [
                '-m',
                '-h',
                config.cacheControl,
                'cp',
                '-r',
                directory,
                `gs://${bucket}/`,
            ]);
            run('gsutil', [
                '-h',
                'Cache-Control:no-store',
                'cp',
                manifest,
                `gs://${bucket}/releases/${publication}.json`,
            ]);
        }
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

function main(): void {
    const { values } = parseArgs({
        options: {
            image: { type: 'string' },
            'image-digest': { type: 'string' },
            directory: { type: 'string' },
            bucket: { type: 'string', multiple: true },
        },
    });
    if (
        !values.image ||
        !values.bucket ||
        !values.directory ||
        !values['image-digest']
    ) {
        throw new Error(
            'Usage: node upload-static-assets.mts --image <image> --image-digest <sha256:digest> --directory <assets> --bucket <bucket> [--bucket <bucket>]',
        );
    }
    upload({
        image: values.image,
        imageDigest: values['image-digest'],
        directory: values.directory,
        buckets: values.bucket,
    });
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    main();
}
