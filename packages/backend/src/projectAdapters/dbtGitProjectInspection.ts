import * as fs from 'fs/promises';
import * as path from 'path';
import { performance } from 'perf_hooks';

const FILESYSTEM_BATCH_SIZE = 32;
const MAX_GIT_METADATA_FILE_BYTES = 1024 * 1024;
const CREDENTIAL_URL = /https?:\/\/[^\s/@]+(?::[^\s/@]*)?@/i;

type InspectionMode = 'checkout' | 'git-metadata' | 'size-only';

type PendingPath = {
    path: string;
    mode: InspectionMode;
    gitRoot: boolean;
};

export type DbtGitProjectInspection = {
    containsCredentials: boolean;
    sizeBytes: number;
    durationMs: number;
};

export const inspectDbtGitProject = async (
    root: string,
): Promise<DbtGitProjectInspection> => {
    const startedAt = performance.now();
    let containsCredentials = false;
    let sizeBytes = 0;
    const pending: PendingPath[] = [
        { path: root, mode: 'checkout', gitRoot: false },
    ];

    const inspectBatch = async (): Promise<void> => {
        const batch = pending.splice(0, FILESYSTEM_BATCH_SIZE);
        if (batch.length === 0) return;
        const results = await Promise.all(
            batch.map(async (candidate) => {
                const stat = await fs.lstat(candidate.path);
                sizeBytes += stat.size;
                if (candidate.gitRoot && !stat.isDirectory()) {
                    throw new Error('Git indirection is not cacheable');
                }
                if (stat.isSymbolicLink()) {
                    if (candidate.mode === 'git-metadata') {
                        throw new Error('Unsupported Git metadata');
                    }
                    return [];
                }
                if (stat.isDirectory()) {
                    const entries = await fs.readdir(candidate.path, {
                        withFileTypes: true,
                    });
                    return entries.map((entry): PendingPath => {
                        const childPath = path.join(candidate.path, entry.name);
                        if (candidate.mode === 'size-only') {
                            return {
                                path: childPath,
                                mode: 'size-only',
                                gitRoot: false,
                            };
                        }
                        if (candidate.mode === 'git-metadata') {
                            return {
                                path: childPath,
                                mode:
                                    entry.name === 'objects' ||
                                    entry.name === 'index'
                                        ? 'size-only'
                                        : 'git-metadata',
                                gitRoot: false,
                            };
                        }
                        return {
                            path: childPath,
                            mode:
                                entry.name === '.git'
                                    ? 'git-metadata'
                                    : 'checkout',
                            gitRoot: entry.name === '.git',
                        };
                    });
                }
                if (candidate.mode === 'git-metadata') {
                    if (!stat.isFile()) {
                        throw new Error('Unsupported Git metadata');
                    }
                    if (stat.size > MAX_GIT_METADATA_FILE_BYTES) {
                        containsCredentials = true;
                    } else {
                        const content = await fs.readFile(
                            candidate.path,
                            'utf8',
                        );
                        if (CREDENTIAL_URL.test(content)) {
                            containsCredentials = true;
                        }
                    }
                }
                return [];
            }),
        );
        for (const children of results) pending.push(...children);
        await inspectBatch();
    };
    await inspectBatch();

    return {
        containsCredentials,
        sizeBytes,
        durationMs: performance.now() - startedAt,
    };
};
