import { DeniedPathError } from '../deniedPaths';
import { assertStagedPathsAllowed, collectFileChanges } from './sandboxGit';

// Minimal sandbox stub exposing only what the denied-path gate touches:
// `commands.run` returns the `git diff --cached --name-status -z` buffer, and
// `files.read` is the per-addition content read collectFileChanges performs
// AFTER the gate passes (so it must NOT be called on a denied changeset).
const sandboxWith = (nameStatusZ: string) =>
    ({
        sandboxId: 'sbx',
        commands: { run: jest.fn().mockResolvedValue({ stdout: nameStatusZ }) },
        files: { read: jest.fn().mockResolvedValue('contents') },
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
            (sandbox as unknown as { files: { read: jest.Mock } }).files.read,
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
