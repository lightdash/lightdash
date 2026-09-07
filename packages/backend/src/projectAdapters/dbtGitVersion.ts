import { getErrorMessage } from '@lightdash/common';
import simpleGit, { type VersionResult } from 'simple-git';
import Logger from '../logging/logger';

export type DbtGitVersionSupport = {
    supported: boolean;
    reason: 'git-version-unsupported' | 'git-version-probe-failed' | null;
};

type DbtGitVersionSupportProbeDependencies = {
    getVersion: () => Promise<VersionResult>;
    warn: (message: string, metadata?: unknown) => unknown;
};

export const createDbtGitVersionSupportProbe = ({
    getVersion = () => simpleGit().version(),
    warn = (message, metadata) => Logger.warn(message, metadata),
}: Partial<DbtGitVersionSupportProbeDependencies> = {}) => {
    let result: Promise<DbtGitVersionSupport> | undefined;
    return (): Promise<DbtGitVersionSupport> => {
        result ??= Promise.resolve()
            .then(getVersion)
            .then<DbtGitVersionSupport>((gitVersion) => {
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
                return {
                    supported: false,
                    reason: 'git-version-probe-failed',
                };
            });
        return result;
    };
};

export const getDbtGitVersionSupport = createDbtGitVersionSupportProbe();
