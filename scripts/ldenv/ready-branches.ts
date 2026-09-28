import { randomUUID } from 'node:crypto';
import { git, saveInstance } from './io';
import type { Instance } from './model';

const branchOperations = { git, saveInstance, uuid: randomUUID };

export function claimedWorkBranch(instance: Instance): string {
    const owned = instance.readyWorktree;
    if (!owned) throw new Error('Ready branch ownership is missing');
    const suffix =
        owned.suffix ??
        (owned.branch.startsWith('ready/')
            ? owned.branch.slice('ready/'.length)
            : instance.id);
    return `work/${suffix}`;
}

function collides(branch: string, other: string): boolean {
    return (
        branch === other ||
        branch.startsWith(`${other}/`) ||
        other.startsWith(`${branch}/`)
    );
}

export async function readyBranchCollision(
    worktree: string,
    branch: string,
    runGit: typeof git,
    excluding?: string | Set<string>,
    checkRemotes = true,
): Promise<boolean> {
    const refs = (
        await runGit(worktree, [
            'for-each-ref',
            '--format=%(refname)',
            'refs/heads',
            'refs/remotes',
        ])
    )
        .split('\n')
        .filter(Boolean);
    if (
        refs.some((ref) => {
            if (
                ref.startsWith('refs/heads/') &&
                (typeof excluding === 'string'
                    ? ref === `refs/heads/${excluding}`
                    : excluding?.has(ref.slice('refs/heads/'.length)))
            )
                return false;
            const name = ref.startsWith('refs/heads/')
                ? ref.slice('refs/heads/'.length)
                : ref
                      .slice('refs/remotes/'.length)
                      .split('/')
                      .slice(1)
                      .join('/');
            return collides(branch, name);
        })
    )
        return true;
    if (!checkRemotes) return false;
    for (const remote of (await runGit(worktree, ['remote']))
        .split('\n')
        .filter(Boolean)) {
        const heads = await runGit(worktree, ['ls-remote', '--heads', remote]);
        if (
            heads.split('\n').some((line) => {
                const ref = line.split('\t')[1];
                return ref?.startsWith('refs/heads/')
                    ? collides(branch, ref.slice('refs/heads/'.length))
                    : false;
            })
        )
            return true;
    }
    return false;
}

export async function nextReadyBranch(
    worktree: string,
    runGit = git,
): Promise<string> {
    for (let number = 2; number < 10000; number += 1) {
        const branch = `ready-${number}`;
        if (!(await readyBranchCollision(worktree, branch, runGit)))
            return branch;
    }
    throw new Error('No free ready spare branch name');
}

export async function recoverReadyBranchRename(
    instance: Instance,
    operations = { git, saveInstance },
): Promise<boolean> {
    const owned = instance.readyWorktree;
    const intent = owned?.renaming;
    if (!owned || !intent) return false;
    const currentBranch = await operations.git(instance.worktree, [
        'branch',
        '--show-current',
    ]);
    const head = await operations.git(instance.worktree, ['rev-parse', 'HEAD']);
    if (
        head !== owned.head ||
        ![intent.from, intent.to].includes(currentBranch)
    )
        throw new Error('Ready branch changed during rename recovery');
    if (currentBranch === intent.from) {
        const fromHead = await operations.git(instance.worktree, [
            'rev-parse',
            '--verify',
            `refs/heads/${intent.from}`,
        ]);
        if (fromHead !== owned.head)
            throw new Error('Ready branch ref changed during rename recovery');
        if (
            await readyBranchCollision(
                instance.worktree,
                intent.to,
                operations.git,
                intent.from,
            )
        )
            throw new Error(`Ready branch namespace collision: ${intent.to}`);
        await operations.git(instance.worktree, [
            'branch',
            '-m',
            intent.from,
            intent.to,
        ]);
    }
    if (
        (await operations.git(instance.worktree, [
            'for-each-ref',
            '--format=%(refname)',
            `refs/heads/${intent.from}`,
        ])) === `refs/heads/${intent.from}`
    )
        throw new Error('Ready branch rename left both refs present');
    const toHead = await operations.git(instance.worktree, [
        'rev-parse',
        '--verify',
        `refs/heads/${intent.to}`,
    ]);
    if (
        toHead !== owned.head ||
        (await operations.git(instance.worktree, [
            'branch',
            '--show-current',
        ])) !== intent.to
    )
        throw new Error('Ready branch changed during rename recovery');
    owned.branch = intent.to;
    delete owned.renaming;
    await operations.saveInstance(instance);
    return true;
}

export async function renameOwnedReadyBranch(
    instance: Instance,
    target: string,
    operations = { git, saveInstance, now: () => new Date().toISOString() },
): Promise<void> {
    const owned = instance.readyWorktree;
    if (!owned || owned.publication === 'pending')
        throw new Error('Ready branch is not published');
    await recoverReadyBranchRename(instance, operations);
    if (owned.branch === target) return;
    const current = await operations.git(instance.worktree, [
        'branch',
        '--show-current',
    ]);
    const head = await operations.git(instance.worktree, ['rev-parse', 'HEAD']);
    const refHead = await operations.git(instance.worktree, [
        'rev-parse',
        '--verify',
        `refs/heads/${owned.branch}`,
    ]);
    if (
        current !== owned.branch ||
        head !== owned.head ||
        refHead !== owned.head
    )
        throw new Error('Ready branch changed before rename');
    if (
        await readyBranchCollision(
            instance.worktree,
            target,
            operations.git,
            owned.branch,
        )
    )
        throw new Error(`Ready branch namespace collision: ${target}`);
    owned.suffix ??= claimedWorkBranch(instance).slice('work/'.length);
    owned.renaming = { from: owned.branch, to: target, at: operations.now() };
    await operations.saveInstance(instance);
    await recoverReadyBranchRename(instance, operations);
}

export async function hideReadyBranchForRetirement(
    instance: Instance,
    operations = { git, saveInstance, now: () => new Date().toISOString() },
): Promise<boolean> {
    const owned = instance.readyWorktree;
    if (!owned) return false;
    await recoverReadyBranchRename(instance, operations);
    const currentBranch = await operations.git(instance.worktree, [
        'branch',
        '--show-current',
    ]);
    if (currentBranch === '' && owned.publication === 'pending') return false;
    if (!owned.retiring && currentBranch !== owned.branch)
        throw new Error('Ready branch changed before retirement');
    if (!owned.retiring) {
        if (!owned.suffix) {
            owned.suffix = claimedWorkBranch(instance).slice('work/'.length);
            await operations.saveInstance(instance);
        }
        owned.retiring = {
            branch: `ldenv-retiring/${claimedWorkBranch(instance).slice('work/'.length)}`,
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
    const suffix = `${instance.parent.slice(0, 7)}-${operations.uuid().replaceAll('-', '').slice(0, 12)}`;
    const branch = await nextReadyBranch(instance.worktree, operations.git);
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
    if (await readyBranchCollision(instance.worktree, branch, operations.git))
        throw new Error(`Ready branch namespace collision: ${branch}`);
    instance.readyWorktree = {
        branch,
        head,
        parentBuiltAt,
        publication: 'pending',
        suffix,
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
    const currentBranch = await runGit(instance.worktree, [
        'branch',
        '--show-current',
    ]);
    if (currentBranch === owned.branch) return false;
    const worktrees = await runGit(instance.worktree, [
        'worktree',
        'list',
        '--porcelain',
        '-z',
    ]);
    let deleted = false;
    if (!worktrees.split('\0').includes(`branch ${ref}`)) {
        let refHead: string | null = null;
        try {
            refHead = await runGit(instance.worktree, [
                'rev-parse',
                '--verify',
                ref,
            ]);
        } catch {
            refHead = null;
        }
        if (refHead === owned.head) {
            await runGit(instance.worktree, [
                'update-ref',
                '-d',
                ref,
                owned.head,
            ]);
            deleted = true;
        }
    }
    owned.branch = currentBranch;
    return deleted;
}
