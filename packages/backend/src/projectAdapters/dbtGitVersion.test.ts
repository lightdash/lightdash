import type { VersionResult } from 'simple-git';
import { createDbtGitVersionSupportProbe } from './dbtGitVersion';

const version = (major: number, minor: number): VersionResult => ({
    major,
    minor,
    patch: 0,
    agent: 'git',
    installed: true,
});

describe('dbtGitVersion', () => {
    it('enables caching for the minimum supported Git version', async () => {
        const getVersion = vi.fn().mockResolvedValue(version(2, 29));
        const warn = vi.fn();
        const probe = createDbtGitVersionSupportProbe({ getVersion, warn });

        await expect(probe()).resolves.toEqual({
            supported: true,
            reason: null,
        });
        expect(warn).not.toHaveBeenCalled();
    });

    it('disables caching and warns for an older Git version', async () => {
        const getVersion = vi.fn().mockResolvedValue(version(2, 28));
        const warn = vi.fn();
        const probe = createDbtGitVersionSupportProbe({ getVersion, warn });

        await expect(probe()).resolves.toEqual({
            supported: false,
            reason: 'git-version-unsupported',
        });
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('disables caching and warns when the Git version probe fails', async () => {
        const getVersion = vi.fn().mockRejectedValue(new Error('probe failed'));
        const warn = vi.fn();
        const probe = createDbtGitVersionSupportProbe({ getVersion, warn });

        await expect(probe()).resolves.toEqual({
            supported: false,
            reason: 'git-version-probe-failed',
        });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(
            'Dbt Git checkout cache disabled because the Git version probe failed',
            {
                error: { name: 'Error', message: 'probe failed' },
            },
        );
    });

    it('memoizes the first probe result and warning', async () => {
        const getVersion = vi.fn().mockResolvedValue(version(1, 9));
        const warn = vi.fn();
        const probe = createDbtGitVersionSupportProbe({ getVersion, warn });

        await Promise.all([probe(), probe(), probe()]);

        expect(getVersion).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
