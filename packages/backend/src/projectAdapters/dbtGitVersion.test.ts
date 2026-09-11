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
    afterEach(() => {
        vi.useRealTimers();
    });

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

    it('times out a hung probe and retries after the cooldown', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        let resolveFirst: ((result: VersionResult) => void) | undefined;
        const firstProbe = new Promise<VersionResult>((resolve) => {
            resolveFirst = resolve;
        });
        const getVersion = vi
            .fn()
            .mockImplementationOnce(() => firstProbe)
            .mockResolvedValueOnce(version(2, 29));
        const warn = vi.fn();
        const probe = createDbtGitVersionSupportProbe({ getVersion, warn });

        const timedOut = probe();
        await vi.advanceTimersByTimeAsync(3_000);
        await expect(timedOut).resolves.toEqual({
            supported: false,
            reason: 'git-version-probe-failed',
        });
        await expect(probe()).resolves.toEqual({
            supported: false,
            reason: 'git-version-probe-failed',
        });
        expect(getVersion).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(29_999);
        await expect(probe()).resolves.toEqual({
            supported: false,
            reason: 'git-version-probe-failed',
        });
        expect(getVersion).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        await expect(probe()).resolves.toEqual({
            supported: true,
            reason: null,
        });
        resolveFirst?.(version(1, 0));
        await Promise.resolve();
        await expect(probe()).resolves.toEqual({
            supported: true,
            reason: null,
        });
        expect(getVersion).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('suppresses repeated failure warnings before recovery', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const getVersion = vi
            .fn()
            .mockRejectedValueOnce(new Error('probe failed'))
            .mockRejectedValueOnce(new Error('probe failed again'))
            .mockResolvedValueOnce(version(2, 29));
        const warn = vi.fn();
        const probe = createDbtGitVersionSupportProbe({
            getVersion,
            warn,
        });

        await expect(probe()).resolves.toMatchObject({ supported: false });
        await vi.advanceTimersByTimeAsync(30_000);
        await expect(probe()).resolves.toMatchObject({ supported: false });
        await vi.advanceTimersByTimeAsync(30_000);
        await expect(probe()).resolves.toEqual({
            supported: true,
            reason: null,
        });
        expect(getVersion).toHaveBeenCalledTimes(3);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('keeps a retry failure quiet after an initial timeout warning', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        let resolveInitial: ((result: VersionResult) => void) | undefined;
        const initialProbe = new Promise<VersionResult>((resolve) => {
            resolveInitial = resolve;
        });
        const getVersion = vi
            .fn()
            .mockImplementationOnce(() => initialProbe)
            .mockRejectedValueOnce(new Error('retry failed'));
        const warn = vi.fn();
        const probe = createDbtGitVersionSupportProbe({ getVersion, warn });

        const timedOut = probe();
        await vi.advanceTimersByTimeAsync(3_000);
        await expect(timedOut).resolves.toMatchObject({ supported: false });
        await vi.advanceTimersByTimeAsync(30_000);
        await expect(probe()).resolves.toMatchObject({ supported: false });

        expect(getVersion).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalledTimes(1);
        resolveInitial?.(version(2, 29));
    });

    it('logs an unsupported result separately after a probe failure', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const getVersion = vi
            .fn()
            .mockRejectedValueOnce(new Error('probe failed'))
            .mockResolvedValueOnce(version(2, 28));
        const warn = vi.fn();
        const probe = createDbtGitVersionSupportProbe({ getVersion, warn });

        await expect(probe()).resolves.toMatchObject({ supported: false });
        await vi.advanceTimersByTimeAsync(30_000);
        await expect(probe()).resolves.toEqual({
            supported: false,
            reason: 'git-version-unsupported',
        });
        await vi.advanceTimersByTimeAsync(30_000);
        await expect(probe()).resolves.toEqual({
            supported: false,
            reason: 'git-version-unsupported',
        });

        expect(getVersion).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenNthCalledWith(
            1,
            'Dbt Git checkout cache disabled because the Git version probe failed',
            expect.anything(),
        );
        expect(warn).toHaveBeenNthCalledWith(
            2,
            'Dbt Git checkout cache disabled because Git 2.29 or newer is required',
            { version: '2.28.0' },
        );
    });
});
