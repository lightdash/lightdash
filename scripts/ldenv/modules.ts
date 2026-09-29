import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import {
    cp,
    lstat,
    mkdir,
    readFile,
    readdir,
    readlink,
    realpath,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const gitFiles = promisify(execFile);
const excluded = new Set(['.vite', '.ldenv-vite-cache']);

function inside(root: string, file: string): boolean {
    const relative = path.relative(root, file);
    return (
        relative === '' ||
        (relative !== '..' &&
            !relative.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relative))
    );
}

async function present(file: string): Promise<boolean> {
    try {
        await lstat(file);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
    }
}

async function moduleTrees(root: string): Promise<string[]> {
    const manifests = await inputFiles(root, [
        'package.json',
        '**/package.json',
    ]);
    if (!manifests.includes('package.json'))
        throw new Error(`Parent has no tracked root package.json: ${root}`);
    const trees = await Promise.all(
        manifests.map(async (file) => {
            const relative = path.join(path.dirname(file), 'node_modules');
            const source = path.join(root, relative);
            if (!(await present(source))) return null;
            if (!(await lstat(source)).isDirectory())
                throw new Error(
                    `Parent module tree is not a directory: ${source}`,
                );
            return relative;
        }),
    );
    return trees.filter((tree): tree is string => tree !== null);
}

async function inputFiles(root: string, patterns: string[]): Promise<string[]> {
    const searches = await Promise.all([
        gitFiles('git', ['ls-files', '-z', '--', ...patterns], {
            cwd: root,
            encoding: 'buffer',
            maxBuffer: 10 * 1024 * 1024,
        }),
        gitFiles(
            'git',
            [
                'ls-files',
                '--others',
                '--exclude-standard',
                '-z',
                '--',
                ...patterns,
            ],
            {
                cwd: root,
                encoding: 'buffer',
                maxBuffer: 10 * 1024 * 1024,
            },
        ),
    ]);
    return [
        ...new Set(
            searches.flatMap(({ stdout }) =>
                stdout.toString().split('\0').filter(Boolean),
            ),
        ),
    ].sort();
}

async function sameFile(parent: string, target: string): Promise<boolean> {
    try {
        if (!(await lstat(parent)).isFile() || !(await lstat(target)).isFile())
            return false;
        return (await readFile(parent)).equals(await readFile(target));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
    }
}

export async function globalModuleInputsMatch(
    parentRoot: string,
    targetRoot: string,
): Promise<boolean> {
    const parent = path.resolve(parentRoot);
    const target = path.resolve(targetRoot);
    const patterns = ['package.json', '**/package.json', 'patches'];
    const [parentFiles, targetFiles] = await Promise.all([
        inputFiles(parent, patterns),
        inputFiles(target, patterns),
    ]);
    if (parentFiles.length !== targetFiles.length) return false;
    for (let index = 0; index < parentFiles.length; index += 1) {
        if (parentFiles[index] !== targetFiles[index]) return false;
        if (
            !(await sameFile(
                path.join(parent, parentFiles[index]),
                path.join(target, targetFiles[index]),
            ))
        )
            return false;
    }
    for (const file of ['pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
        if (!(await sameFile(path.join(parent, file), path.join(target, file))))
            return false;
    }
    for (const file of ['.npmrc', '.pnpmfile.cjs']) {
        const parentConfig = path.join(parent, file);
        const targetConfig = path.join(target, file);
        if ((await present(parentConfig)) !== (await present(targetConfig)))
            return false;
        if (
            (await present(parentConfig)) &&
            !(await sameFile(parentConfig, targetConfig))
        )
            return false;
    }
    return true;
}

type Link = { destination: string; target: string; workspace: boolean };

async function inspectTree(
    source: string,
    parentRoot: string,
    canonicalParent: string,
    targetRoot: string,
    storeDir: string,
    links: Link[],
): Promise<void> {
    for (const entry of await readdir(source, { withFileTypes: true })) {
        if (excluded.has(entry.name)) continue;
        const file = path.join(source, entry.name);
        if (entry.isSymbolicLink()) {
            const raw = await readlink(file);
            const lexical = path.resolve(path.dirname(file), raw);
            const resolved = await realpath(file).catch(() => {
                throw new Error(
                    `Unsafe or broken parent dependency link: ${file}`,
                );
            });
            const lexicalParent = inside(parentRoot, lexical);
            const resolvedParent = inside(canonicalParent, resolved);
            const resolvedStore = inside(storeDir, resolved);
            if (
                lexicalParent
                    ? !resolvedParent && !resolvedStore
                    : !resolvedStore
            )
                throw new Error(
                    `Dependency link resolves outside parent and pnpm store: ${file}`,
                );
            const mapped = lexicalParent
                ? path.join(targetRoot, path.relative(parentRoot, lexical))
                : lexical;
            links.push({
                destination: path.join(
                    targetRoot,
                    path.relative(parentRoot, file),
                ),
                target: mapped,
                workspace: lexicalParent && resolvedParent,
            });
        } else if (entry.isDirectory()) {
            await inspectTree(
                file,
                parentRoot,
                canonicalParent,
                targetRoot,
                storeDir,
                links,
            );
        } else if (!entry.isFile()) {
            throw new Error(`Unsupported parent dependency entry: ${file}`);
        }
    }
}

async function rewriteShims(
    tree: string,
    parentRoot: string,
    targetRoot: string,
): Promise<void> {
    for (const bin of [
        path.join(tree, '.bin'),
        path.join(tree, '.pnpm/node_modules/.bin'),
    ]) {
        if (!(await present(bin))) continue;
        for (const entry of await readdir(bin, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            const file = path.join(bin, entry.name);
            const original = await readFile(file, 'utf8');
            if (original.includes(parentRoot))
                await writeFile(
                    file,
                    original.split(parentRoot).join(targetRoot),
                );
            if ((await readFile(file, 'utf8')).includes(parentRoot))
                throw new Error(`Copied shim still points at parent: ${file}`);
        }
    }
}

async function rewriteMetadata(
    parentRoot: string,
    targetRoot: string,
    storeDir: string,
): Promise<void> {
    const modules = path.join(targetRoot, 'node_modules/.modules.yaml');
    const metadata = JSON.parse(await readFile(modules, 'utf8')) as Record<
        string,
        unknown
    >;
    metadata.virtualStoreDir = path.relative(
        path.dirname(modules),
        path.join(storeDir, 'links'),
    );
    await writeFile(modules, `${JSON.stringify(metadata, null, 2)}\n`);
    const state = path.join(
        targetRoot,
        'node_modules/.pnpm-workspace-state-v1.json',
    );
    if (await present(state)) {
        const original = await readFile(state, 'utf8');
        await writeFile(state, original.split(parentRoot).join(targetRoot));
    }
}

export async function cloneGlobalModules(
    parentRoot: string,
    targetRoot: string,
): Promise<{ cloneMs: number; trees: number; links: number }> {
    const started = Date.now();
    const parent = path.resolve(parentRoot);
    const target = path.resolve(targetRoot);
    if (inside(parent, target) || inside(target, parent))
        throw new Error('Parent and target worktrees must be separate');
    if (!(await lstat(target)).isDirectory())
        throw new Error(`Target worktree is not a directory: ${target}`);
    const modules = path.join(parent, 'node_modules/.modules.yaml');
    const metadata = JSON.parse(await readFile(modules, 'utf8')) as Record<
        string,
        unknown
    >;
    if (
        typeof metadata.storeDir !== 'string' ||
        !path.isAbsolute(metadata.storeDir)
    )
        throw new Error(`Parent does not use a global pnpm store: ${modules}`);
    const storeDir = await realpath(metadata.storeDir);
    if (
        typeof metadata.virtualStoreDir !== 'string' ||
        (await realpath(
            path.resolve(path.dirname(modules), metadata.virtualStoreDir),
        ).catch(() => '')) !== path.join(storeDir, 'links')
    )
        throw new Error(
            `Parent does not use the expected global pnpm layout: ${modules}`,
        );
    const trees = await moduleTrees(parent);
    if (!trees.includes('node_modules'))
        throw new Error(`Parent has no root node_modules: ${parent}`);
    for (const tree of trees) {
        if (await present(path.join(target, tree)))
            throw new Error(
                `Refusing to replace existing dependencies: ${path.join(target, tree)}`,
            );
    }
    const links: Link[] = [];
    const canonicalParent = await realpath(parent);
    const canonicalTarget = await realpath(target);
    for (const tree of trees)
        await inspectTree(
            path.join(parent, tree),
            parent,
            canonicalParent,
            target,
            storeDir,
            links,
        );
    const created: string[] = [];
    try {
        for (const tree of trees) {
            const destination = path.join(target, tree);
            await mkdir(path.dirname(destination), { recursive: true });
            created.push(destination);
            await cp(path.join(parent, tree), destination, {
                recursive: true,
                dereference: false,
                verbatimSymlinks: true,
                force: false,
                errorOnExist: true,
                mode: constants.COPYFILE_FICLONE,
                filter: (source) => !excluded.has(path.basename(source)),
            });
        }
        for (const link of links) {
            await rm(link.destination);
            await symlink(
                path.relative(path.dirname(link.destination), link.target),
                link.destination,
            );
        }
        for (const link of links.filter((entry) => entry.workspace)) {
            const resolved = await realpath(link.destination);
            if (!inside(canonicalTarget, resolved))
                throw new Error(
                    `Workspace dependency resolves outside target: ${link.destination}`,
                );
        }
        for (const tree of trees)
            await rewriteShims(path.join(target, tree), parent, target);
        await rewriteMetadata(parent, target, storeDir);
    } catch (error) {
        for (const destination of created.reverse())
            await rm(destination, { recursive: true, force: true });
        throw error;
    }
    return {
        cloneMs: Date.now() - started,
        trees: trees.length,
        links: links.length,
    };
}
