import { type ApiAppVersionSummary } from '@lightdash/common';
import { type useGetApp } from '../hooks/useGetApp';

type UseGetAppResult = ReturnType<typeof useGetApp>;

/** A ready version, newest-first fixtures override what they care about. */
export const appVersion = (
    overrides: Partial<ApiAppVersionSummary> = {},
): ApiAppVersionSummary =>
    ({
        version: 1,
        prompt: 'a donut of orders by status',
        status: 'ready',
        createdAt: new Date('2026-05-15T10:00:00Z'),
        statusUpdatedAt: new Date('2026-05-15T10:00:52Z'),
        createdByUser: {
            userUuid: 'u1',
            firstName: 'Katie',
            lastName: 'Jones',
        },
        resources: null,
        ...overrides,
    }) as ApiAppVersionSummary;

const newestReady = (versions: ApiAppVersionSummary[]): number | null =>
    versions
        .filter((v) => v.status === 'ready')
        .reduce<number | null>(
            (max, v) => (max === null ? v.version : Math.max(max, v.version)),
            null,
        );

/**
 * What `useGetApp` returns for one loaded page.
 *
 * The server resolves `latestReadyVersion` outside pagination; by default it
 * agrees with the newest ready version here. Pass it to pull the two apart.
 */
export const appVersionsPage = (
    versions: ApiAppVersionSummary[],
    latestReadyVersion: number | null = newestReady(versions),
): UseGetAppResult =>
    ({
        data: {
            pages: [{ versions, hasMore: false, latestReadyVersion }],
            pageParams: [undefined],
        },
        isLoading: false,
        isError: false,
    }) as unknown as UseGetAppResult;

/** What `useGetApp` returns when the history could not be read at all. */
export const appVersionsUnreadable = (): UseGetAppResult =>
    ({
        data: undefined,
        isLoading: false,
        isError: true,
    }) as unknown as UseGetAppResult;
