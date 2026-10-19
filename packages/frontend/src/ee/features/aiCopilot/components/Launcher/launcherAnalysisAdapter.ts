import { useEffect, useSyncExternalStore } from 'react';
import { type DataAppAnalysisAvailability } from '../../../../../features/apps/analysis/useDataAppAnalysisAvailability';
import { type DataAppAnalysisController } from '../../../../../features/apps/analysis/useDataAppAnalysisController';

/**
 * What a page must provide for the launcher to offer AI analysis of the
 * current view. Lives outside Redux: the controller and callbacks are
 * not serializable, and hover-highlighting is high-frequency.
 */
export type LauncherAnalysisAdapter = {
    projectUuid: string;
    /** Shown next to "Analysis" in the panel header. */
    targetName: string | null;
    availability: DataAppAnalysisAvailability;
    controller: DataAppAnalysisController;
    /** True when hovering a finding can highlight its source on the page. */
    highlightAvailable: boolean;
    onHoverQuery: (queryUuid: string | null) => void;
};

let currentAdapter: LauncherAnalysisAdapter | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const getSnapshot = () => currentAdapter;

const setLauncherAnalysisAdapter = (
    adapter: LauncherAnalysisAdapter | null,
): void => {
    currentAdapter = adapter;
    listeners.forEach((listener) => listener());
};

/**
 * The page owning the current view publishes its adapter; at most one page
 * at a time renders this hook. Cleared on unmount.
 */
// Registration lands with the page migration.
// ts-unused-exports:disable-next-line
export const useRegisterLauncherAnalysisAdapter = (
    adapter: LauncherAnalysisAdapter | null,
): void => {
    useEffect(() => {
        setLauncherAnalysisAdapter(adapter);
        return () => setLauncherAnalysisAdapter(null);
    }, [adapter]);
};

export const useLauncherAnalysisAdapter = (
    projectUuid: string | undefined,
): LauncherAnalysisAdapter | null => {
    const adapter = useSyncExternalStore(subscribe, getSnapshot);
    return adapter && adapter.projectUuid === projectUuid ? adapter : null;
};
