import { randomUUID } from 'node:crypto';
import { git, saveInstance } from './io';
import type { Instance } from './model';

const branchOperations = { git, saveInstance, uuid: randomUUID };

export async function hideReadyBranchForRetirement(
    instance: Instance,
    operations = { git, saveInstance, now: () => new Date().toISOString() },
): Promise<boolean> {
    const owned = instance.readyWorktree;
    if (!owned) return false;
    const currentBranch = await operations.git(instance.worktree, [
        'branch',
        '--show-current',
    ]);
    if (currentBranch === '' && owned.publication === 'pending') return false;
    if (!owned.retiring && currentBranch !== owned.branch)
        throw new Error('Ready branch changed before retirement');
    if (!owned.retiring) {
        owned.retiring = {
            branch: `ldenv-retiring/${owned.branch.slice('ready/'.length)}`,
            at: operations.now(),
        };
        await operations.saveInstance(instance);
    }
    if (currentBranch === owned.branch) {
        const head = await operations.git(instance.worktree, [
            'rev-parse',
            'HEAD',
        ]);
        const refHead = await operations.git(instance.worktree, [
            'rev-parse',
            '--verify',
            `refs/heads/${owned.branch}`,
        ]);
        if (head !== owned.head || refHead !== owned.head)
            throw new Error('Ready branch changed before retirement');
        await operations.git(instance.worktree, [
            'branch',
            '-m',
            owned.branch,
            owned.retiring.branch,
        ]);
    } else if (
        !(currentBranch === '' && owned.publication === 'pending') &&
        currentBranch !== owned.retiring.branch
    )
        throw new Error('Ready branch changed before retirement');
    const actualBranch = await operations.git(instance.worktree, [
        'branch',
        '--show-current',
    ]);
    const actualHead = await operations.git(instance.worktree, [
        'rev-parse',
        'HEAD',
    ]);
    if (
        actualHead !== owned.head ||
        (actualBranch !== owned.retiring.branch &&
            !(actualBranch === '' && owned.publication === 'pending'))
    )
        throw new Error('Ready branch changed during retirement');
    owned.retiring.hiddenAt ??= operations.now();
    await operations.saveInstance(instance);
    return true;
}

export async function publishReadyBranch(
    instance: Instance,
    parentBuiltAt: string,
    operations = branchOperations,
): Promise<void> {
    if (instance.kind !== 'warming' || instance.phase !== 'ready')
        throw new Error('Only a ready warming instance can own a ready branch');
    if (instance.readyWorktree)
        throw new Error('Ready branch ownership is already recorded');
    const branch = `ready/${instance.parent.slice(0, 7)}-${operations.uuid().replaceAll('-', '').slice(0, 12)}`;
    const ref = `refs/heads/${branch}`;
    await operations.git(instance.worktree, [
        'check-ref-format',
        '--branch',
        branch,
    ]);
    const head = await operations.git(instance.worktree, ['rev-parse', 'HEAD']);
    if (head !== instance.parent)
        throw new Error('Warming worktree HEAD changed before publication');
    const currentBranch = await operations.git(instance.worktree, [
        'branch',
        '--show-current',
    ]);
    if (currentBranch)
        throw new Error('Warming worktree is no longer detached');
    const localRefs = (
        await operations.git(instance.worktree, [
            'for-each-ref',
            '--format=%(refname)',
            'refs/heads',
            'refs/remotes',
        ])
    )
        .split('\n')
        .filter(Boolean);
    if (
        localRefs.some(
            (existing) =>
                existing === ref ||
                existing === 'refs/heads/ready' ||
                (existing.startsWith('refs/remotes/') &&
                    (existing.endsWith(`/${branch}`) ||
                        existing.endsWith('/ready'))),
        )
    )
        throw new Error(`Ready branch namespace collision: ${branch}`);
    const remotes = (await operations.git(instance.worktree, ['remote']))
        .split('\n')
        .filter(Boolean);
    for (const remote of remotes) {
        const published = await operations.git(instance.worktree, [
            'ls-remote',
            '--heads',
            remote,
            'refs/heads/ready',
            ref,
        ]);
        if (published)
            throw new Error(
                `Ready branch namespace collision on ${remote}: ${branch}`,
            );
    }
    instance.readyWorktree = {
        branch,
        head,
        parentBuiltAt,
        publication: 'pending',
    };
    await operations.saveInstance(instance);
    await operations.git(instance.worktree, ['switch', '-c', branch, head]);
    const actualBranch = await operations.git(instance.worktree, [
        'branch',
        '--show-current',
    ]);
    const actualHead = await operations.git(instance.worktree, [
        'rev-parse',
        'HEAD',
    ]);
    if (actualBranch !== branch || actualHead !== head)
        throw new Error('Ready branch changed during publication');
    instance.readyWorktree.publication = 'published';
    await operations.saveInstance(instance);
}

export async function retireClaimedReadyBranch(
    instance: Instance,
    previousBranch: string,
    previousHead: string,
    runGit = git,
): Promise<boolean> {
    const owned = instance.readyWorktree;
    if (
        !owned ||
        previousBranch !== owned.branch ||
        previousHead !== owned.head ||
        instance.kind !== 'claimed'
    )
        return false;
    const ref = `refs/heads/${owned.branch}`;
    if (
        (await runGit(instance.worktree, ['branch', '--show-current'])) ===
        owned.branch
    )
        return false;
    const worktrees = await runGit(instance.worktree, [
        'worktree',
        'list',
        '--porcelain',
        '-z',
    ]);
    if (worktrees.split('\0').includes(`branch ${ref}`)) return false;
    if (
        (await runGit(instance.worktree, ['rev-parse', '--verify', ref])) !==
        owned.head
    )
        return false;
    await runGit(instance.worktree, ['update-ref', '-d', ref, owned.head]);
    return true;
}
