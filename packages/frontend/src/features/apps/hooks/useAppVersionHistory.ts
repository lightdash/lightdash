import { type ApiAppVersionSummary } from '@lightdash/common';
import { useMemo } from 'react';
import { useGetApp } from './useGetApp';

export type AppVersionHistory = {
    /** Every version loaded so far, newest first. */
    versions: ApiAppVersionSummary[];
    /** The oldest loaded version; null before anything has loaded. */
    oldest: ApiAppVersionSummary | null;
    /**
     * The newest loaded version whatever its status, so a build that failed or
     * is still running is the one reported. This is "last updated", not what
     * anything renders — for that, use `latestReadyVersion`.
     */
    latest: ApiAppVersionSummary | null;
    /**
     * The version every chart using this visualization renders: the newest one
     * that finished, resolved server-side across ALL versions rather than the
     * loaded page window. Null when nothing has ever built successfully.
     */
    latestReadyVersion: number | null;
    /**
     * True once version 1 is loaded. Versions are 1-indexed and contiguous, so
     * holding it means `oldest` really is the origin rather than the oldest
     * page we happened to fetch.
     */
    hasOrigin: boolean;
    /** There are older versions the server has not been asked for yet. */
    hasEarlier: boolean;
    isLoading: boolean;
    /** The history could not be read, so `versions` is empty by failure. */
    isError: boolean;
    isFetchingEarlier: boolean;
    fetchEarlier: () => void;
};

/**
 * A visualization's version history — the thread it carries.
 *
 * Every surface that reads it (the conversation, the panel's footer) shares
 * one query key, so they page together and derive provenance the same way.
 */
export const useAppVersionHistory = (
    projectUuid: string,
    appUuid: string | null,
): AppVersionHistory => {
    const {
        data,
        isLoading,
        isError,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
    } = useGetApp(projectUuid, appUuid ?? undefined);

    const versions = useMemo(
        () => data?.pages.flatMap((page) => page.versions) ?? [],
        [data?.pages],
    );

    const oldest = useMemo(
        () =>
            versions.reduce<ApiAppVersionSummary | null>(
                (found, v) =>
                    found === null || v.version < found.version ? v : found,
                null,
            ),
        [versions],
    );

    const latest = useMemo(
        () =>
            versions.reduce<ApiAppVersionSummary | null>(
                (found, v) =>
                    found === null || v.version > found.version ? v : found,
                null,
            ),
        [versions],
    );

    const hasOrigin = versions.some((v) => v.version === 1);

    return {
        versions,
        oldest,
        latest,
        // Taken from the server rather than scanned out of `versions`: the
        // ready version can be older than the page window, and a limit=1 poll
        // carries it correctly because it is resolved outside pagination.
        latestReadyVersion: data?.pages?.[0]?.latestReadyVersion ?? null,
        hasOrigin,
        hasEarlier: hasNextPage === true && !hasOrigin,
        isLoading: appUuid !== null && isLoading,
        isError,
        isFetchingEarlier: isFetchingNextPage,
        fetchEarlier: () => void fetchNextPage(),
    };
};
