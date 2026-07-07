import type { Logger } from 'winston';
import { DeniedPathError } from '../deniedPaths';
import {
    assertStagedPathsAllowed,
    collectFileChanges,
    resolveDbtProjectPaths,
    stageChanges,
} from './sandboxGit';

const logger = { info: vi.fn(), warn: vi.fn() } as unknown as Logger;

// Minimal sandbox stub exposing only what the denied-path gate touches:
// `commands.run` returns the `git diff --cached --name-status -z` buffer, and
// `files.read` is the per-addition content read collectFileChanges performs
// AFTER the gate passes (so it must NOT be called on a denied changeset).
const sandboxWith = (nameStatusZ: string) =>
    ({
        sandboxId: 'sbx',
        commands: { run: vi.fn().mockResolvedValue({ stdout: nameStatusZ }) },
        files: { read: vi.fn().mockResolvedValue('contents') },
    }) as never;

const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64');

describe('collectFileChanges — GitHub commit gate', () => {
    it('throws DeniedPathError on a staged secret even when denyCiPaths is false, and never reads/commits it', async () => {
        const sandbox = sandboxWith('A\0.env\0M\0models/x.sql\0');
        await expect(
            collectFileChanges(sandbox, { denyCiPaths: false }),
        ).rejects.toBeInstanceOf(DeniedPathError);
        // A denied changeset must abort before any file content is read.
        expect(
            (sandbox as unknown as { files: { read: import('vitest').Mock } })
                .files.read,
        ).not.toHaveBeenCalled();
    });

    it('denies a CI/workflow file only for the general agent (denyCiPaths:true)', async () => {
        const ci = 'A\0.github/workflows/deploy.yml\0';
        await expect(
            collectFileChanges(sandboxWith(ci), { denyCiPaths: true }),
        ).rejects.toBeInstanceOf(DeniedPathError);

        // dbt writeback legitimately adds .github/workflows for preview deploys,
        // so the same path must pass when CI denial is off.
        const ok = await collectFileChanges(sandboxWith(ci), {
            denyCiPaths: false,
        });
        expect(ok.additions.map((a) => a.path)).toEqual([
            '.github/workflows/deploy.yml',
        ]);
    });

    it('catches a denied deletion too (rename collapses to delete+add via --no-renames)', async () => {
        await expect(
            collectFileChanges(sandboxWith('D\0.env\0'), {
                denyCiPaths: false,
            }),
        ).rejects.toBeInstanceOf(DeniedPathError);
    });

    it('passes an allowed changeset through to base64 additions + deletions', async () => {
        const result = await collectFileChanges(
            sandboxWith('A\0models/x.sql\0D\0old_model.sql\0'),
            { denyCiPaths: true },
        );
        expect(result.additions).toEqual([
            { path: 'models/x.sql', contents: b64('contents') },
        ]);
        expect(result.deletions).toEqual([{ path: 'old_model.sql' }]);
    });
});

describe('assertStagedPathsAllowed — GitLab push gate', () => {
    it('throws DeniedPathError on a staged secret regardless of denyCiPaths', async () => {
        await expect(
            assertStagedPathsAllowed(sandboxWith('A\0deploy/id_rsa\0'), {
                denyCiPaths: false,
            }),
        ).rejects.toBeInstanceOf(DeniedPathError);
    });

    it('denies a CI/workflow file only for the general agent, allows it otherwise', async () => {
        const ci = 'A\0.gitlab-ci.yml\0';
        await expect(
            assertStagedPathsAllowed(sandboxWith(ci), { denyCiPaths: true }),
        ).rejects.toBeInstanceOf(DeniedPathError);
        await expect(
            assertStagedPathsAllowed(sandboxWith(ci), { denyCiPaths: false }),
        ).resolves.toBeUndefined();
    });

    it('allows an ordinary source changeset', async () => {
        await expect(
            assertStagedPathsAllowed(sandboxWith('A\0models/x.sql\0'), {
                denyCiPaths: true,
            }),
        ).resolves.toBeUndefined();
    });
});

// Sandbox stub for resolveDbtProjectPaths: `files.read` dispatches by suffix
// (manifest.json vs dbt_project.yml), and `commands.run` returns the resolver
// script's stdout (the newline-separated repo-relative paths the sandbox would
// print after resolving each local package's dbt_packages symlink).
const resolverSandbox = ({
    manifest,
    dbtProjectYml = '',
    resolverStdout = '',
}: {
    manifest: object | null;
    dbtProjectYml?: string | null;
    resolverStdout?: string;
}) => {
    const run = vi.fn().mockResolvedValue({ stdout: resolverStdout });
    return {
        sandbox: {
            sandboxId: 'sbx',
            files: {
                read: vi.fn(async (path: string) => {
                    if (path.endsWith('/target/manifest.json')) {
                        if (manifest === null) throw new Error('not found');
                        return JSON.stringify(manifest);
                    }
                    if (path.endsWith('/dbt_project.yml')) {
                        if (dbtProjectYml === null)
                            throw new Error('not found');
                        return dbtProjectYml;
                    }
                    throw new Error(`unexpected read: ${path}`);
                }),
            },
            commands: { run },
        } as never,
        run,
    };
};

describe('resolveDbtProjectPaths', () => {
    it('returns ["."] for a repo-root project without touching the manifest', async () => {
        const { sandbox, run } = resolverSandbox({ manifest: null });
        await expect(
            resolveDbtProjectPaths(sandbox, '.', logger),
        ).resolves.toEqual(['.']);
        expect(run).not.toHaveBeenCalled();
    });

    it('stages the connected project PLUS resolved local package trees, skipping root + vendored hub packages', async () => {
        const sub = 'fabrics/acme-data-prod/projects/analytics/core';
        const pkgPath =
            'packages/domains/companies/acme/consumer-aligned/analytics';
        const { sandbox, run } = resolverSandbox({
            manifest: {
                metadata: { project_name: 'acme_core' },
                nodes: {
                    'model.acme_core.fct': { package_name: 'acme_core' },
                    'model.acme_consumer_aligned.dim_widget': {
                        package_name: 'acme_consumer_aligned',
                    },
                },
                // A hub package present only via macros; its dbt_packages entry
                // is a real dir, so the sandbox resolver never emits it.
                macros: { 'macro.dbt_utils.x': { package_name: 'dbt_utils' } },
            },
            resolverStdout: `${pkgPath}\n`,
        });

        await expect(
            resolveDbtProjectPaths(sandbox, sub, logger),
        ).resolves.toEqual([sub, pkgPath]);

        // Both non-root packages are probed in the sandbox; the vendored one is
        // filtered by the symlink test at runtime (stubbed out of stdout here).
        const script = run.mock.calls[0][0] as string;
        expect(script).toContain('acme_consumer_aligned');
        expect(script).toContain('dbt_utils');
        expect(script).not.toContain('acme_core');
        expect(script).toContain(`${sub}/dbt_packages/`);
    });

    it('honors a packages-install-path override from dbt_project.yml', async () => {
        const sub = 'core';
        const { sandbox, run } = resolverSandbox({
            manifest: {
                metadata: { project_name: 'root' },
                nodes: {
                    'model.pkg.m': { package_name: 'pkg' },
                },
            },
            dbtProjectYml: 'packages-install-path: dbt_modules\n',
            resolverStdout: 'shared/pkg\n',
        });
        await expect(
            resolveDbtProjectPaths(sandbox, sub, logger),
        ).resolves.toEqual([sub, 'shared/pkg']);
        expect(run.mock.calls[0][0]).toContain(`${sub}/dbt_modules/`);
    });

    it('drops package names outside the safe dbt charset (no shell injection via a crafted manifest)', async () => {
        const sub = 'core';
        const { sandbox, run } = resolverSandbox({
            manifest: {
                metadata: { project_name: 'root' },
                nodes: {
                    'model.evil.m': { package_name: 'evil; rm -rf /' },
                    'model.good.m': { package_name: 'good_pkg' },
                },
            },
            resolverStdout: '',
        });
        await resolveDbtProjectPaths(sandbox, sub, logger);
        const script = run.mock.calls[0][0] as string;
        expect(script).toContain('good_pkg');
        expect(script).not.toContain('rm -rf');
    });

    it('falls back to [projectSubPath] when the manifest is unreadable', async () => {
        const sub = 'core';
        const { sandbox, run } = resolverSandbox({ manifest: null });
        await expect(
            resolveDbtProjectPaths(sandbox, sub, logger),
        ).resolves.toEqual([sub]);
        expect(run).not.toHaveBeenCalled();
    });

    it('falls back to [projectSubPath] when only the root package compiled (no packages to resolve)', async () => {
        const sub = 'core';
        const { sandbox, run } = resolverSandbox({
            manifest: {
                metadata: { project_name: 'root' },
                nodes: { 'model.root.m': { package_name: 'root' } },
            },
        });
        await expect(
            resolveDbtProjectPaths(sandbox, sub, logger),
        ).resolves.toEqual([sub]);
        expect(run).not.toHaveBeenCalled();
    });
});

describe('stageChanges', () => {
    const stagingSandbox = () => {
        const add = vi.fn().mockResolvedValue(undefined);
        const run = vi.fn().mockResolvedValue({ stdout: '' });
        return {
            sandbox: {
                sandboxId: 'sbx',
                git: { add },
                commands: { run },
            } as never,
            add,
            run,
        };
    };

    it('stages the given paths as files and also the repo-root workflows dir', async () => {
        const { sandbox, add, run } = stagingSandbox();
        const paths = ['fabrics/.../core', 'packages/.../analytics'];
        await stageChanges(sandbox, paths, logger);
        expect(add).toHaveBeenCalledWith(expect.any(String), { files: paths });
        expect(run).toHaveBeenCalledWith(
            expect.stringContaining('add .github/workflows'),
        );
    });

    it('falls back to --all (and skips workflows) when the project is the repo root', async () => {
        const { sandbox, add, run } = stagingSandbox();
        await stageChanges(sandbox, ['.'], logger);
        expect(add).toHaveBeenCalledWith(expect.any(String), { all: true });
        expect(run).not.toHaveBeenCalled();
    });
});
