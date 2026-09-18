import { type ApiAppVersionSummary } from '@lightdash/common';

type ThreadVersion = Pick<
    ApiAppVersionSummary,
    'threadUuid' | 'threadNumber' | 'version'
>;

export type ThreadVersionGroup<T extends ThreadVersion> = {
    threadUuid: string;
    threadNumber: number;
    /** Newest first. */
    versions: T[];
};

/** Newest thread first, each thread's versions newest first. */
export const groupVersionsByThread = <T extends ThreadVersion>(
    versions: T[],
): ThreadVersionGroup<T>[] => {
    const byThread = new Map<string, ThreadVersionGroup<T>>();
    [...versions]
        .sort((a, b) => b.version - a.version)
        .forEach((version) => {
            const group = byThread.get(version.threadUuid);
            if (group) {
                group.versions.push(version);
                return;
            }
            byThread.set(version.threadUuid, {
                threadUuid: version.threadUuid,
                threadNumber: version.threadNumber,
                versions: [version],
            });
        });
    return [...byThread.values()].sort(
        (a, b) => b.threadNumber - a.threadNumber,
    );
};
