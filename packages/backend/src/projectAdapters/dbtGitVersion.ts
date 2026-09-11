import { getErrorMessage } from '@lightdash/common';
import type { VersionResult } from 'simple-git';
import { runAbortableProcess } from '../dbt/dbtCliClient';
import Logger from '../logging/logger';

export type DbtGitVersionSupport = {
    supported: boolean;
    reason: 'git-version-unsupported' | 'git-version-probe-failed' | null;
};

type DbtGitVersionSupportProbeDependencies = {
    getVersion: (signal: AbortSignal) => Promise<VersionResult>;
    warn: (message: string, metadata?: unknown) => unknown;
};

const probeTimeoutMs = 3_000;
const failedProbeCooldownMs = 30_000;

const getVersion = async (signal: AbortSignal): Promise<VersionResult> => {
    const { stdout } = await runAbortableProcess(
        'git',
        ['--version'],
        {},
        signal,
    );
    const match = /(?:^|\s)(\d+)\.(\d+)(?:\.(\d+))?/.exec(stdout.toString());
    if (!match) throw new Error('Could not parse Git version');
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3] ?? 0),
        agent: 'git',
        installed: true,
    };
};

export const createDbtGitVersionSupportProbe = ({
    getVersion: readVersion = getVersion,
    warn = (message, metadata) => Logger.warn(message, metadata),
}: Partial<DbtGitVersionSupportProbeDependencies> = {}) => {
    let generation = 0;
    let active: Promise<DbtGitVersionSupport> | undefined;
    let probeFailureLogged = false;
    let cached:
        | {
              result: DbtGitVersionSupport;
              retryAt: number | null;
          }
        | undefined;

    return (): Promise<DbtGitVersionSupport> => {
        if (active) return active;
        if (
            cached &&
            (cached.retryAt === null || Date.now() < cached.retryAt)
        ) {
            return Promise.resolve(cached.result);
        }

        generation += 1;
        const attempt = generation;
        const controller = new AbortController();
        let timeout: NodeJS.Timeout | undefined;
        const deadline = new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
                controller.abort();
                reject(new Error('Git version probe timed out'));
            }, probeTimeoutMs);
        });
        active = Promise.race([
            Promise.resolve().then(() => readVersion(controller.signal)),
            deadline,
        ])
            .then<DbtGitVersionSupport>((gitVersion) => {
                probeFailureLogged = false;
                const supported =
                    gitVersion.installed &&
                    (gitVersion.major > 2 ||
                        (gitVersion.major === 2 && gitVersion.minor >= 29));
                if (!supported) {
                    warn(
                        'Dbt Git checkout cache disabled because Git 2.29 or newer is required',
                        {
                            version: `${gitVersion.major}.${gitVersion.minor}.${gitVersion.patch}`,
                        },
                    );
                }
                return {
                    supported,
                    reason: supported ? null : 'git-version-unsupported',
                };
            })
            .catch<DbtGitVersionSupport>((error: unknown) => {
                if (!probeFailureLogged) {
                    probeFailureLogged = true;
                    warn(
                        'Dbt Git checkout cache disabled because the Git version probe failed',
                        {
                            error: {
                                name:
                                    error instanceof Error
                                        ? error.name
                                        : 'UnknownError',
                                message: getErrorMessage(error),
                            },
                        },
                    );
                }
                return {
                    supported: false,
                    reason: 'git-version-probe-failed',
                };
            })
            .then((result) => {
                if (attempt === generation) {
                    cached = {
                        result,
                        retryAt:
                            result.reason === 'git-version-probe-failed'
                                ? Date.now() + failedProbeCooldownMs
                                : null,
                    };
                    active = undefined;
                }
                return result;
            })
            .finally(() => {
                if (timeout) clearTimeout(timeout);
            });
        return active;
    };
};

export const getDbtGitVersionSupport = createDbtGitVersionSupportProbe();
