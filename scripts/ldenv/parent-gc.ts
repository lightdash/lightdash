import { existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { dropDatabase, ensurePostgres } from './infra';
import { git, home } from './io';
import type { Parent } from './model';

export async function retireParent(
    root: string,
    parent: Parent,
    base = home,
    operations: {
        ensurePostgres: (root: string) => Promise<unknown>;
        dropDatabase: typeof dropDatabase;
        git: typeof git;
    } = { ensurePostgres, dropDatabase, git },
): Promise<void> {
    const paths = [parent.path, ...(parent.retiredPaths ?? [])];
    if (
        paths.some(
            (directory) =>
                path.dirname(directory) !== path.join(base, 'parents') ||
                !new RegExp(
                    `^${parent.sha.slice(0, 12)}(-cache-[0-9]+)?$`,
                ).test(path.basename(directory)),
        ) ||
        parent.database !== `ldp_${parent.sha.slice(0, 12)}`
    )
        throw new Error('Invalid parent ownership record');
    const manifests = path.join(base, 'manifests');
    const active = path.join(manifests, `${parent.sha}.json`);
    const retired = path.join(manifests, 'retired', `${parent.sha}.json`);
    await mkdir(path.dirname(retired), { recursive: true });
    if (existsSync(active)) await rename(active, retired);
    if (!existsSync(retired))
        throw new Error('Parent retirement record is missing');
    await operations.ensurePostgres(root);
    await operations.dropDatabase(root, parent.database);
    for (const directory of paths) {
        if (!existsSync(directory)) continue;
        await operations.git(root, [
            'worktree',
            'remove',
            '--force',
            directory,
        ]);
    }
    await rm(retired);
}
