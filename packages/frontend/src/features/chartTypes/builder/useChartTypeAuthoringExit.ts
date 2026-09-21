import { useState } from 'react';
import { useDeleteApp } from '../../apps/hooks/useDeleteApp';
import { type DataAppVizDraft } from '../hooks/useDataAppVizBuild';

export type UseChartTypeAuthoringExitArgs = {
    projectUuid: string | undefined;
    dataAppVizUuid: string | null;
    /** True once a build claimed a fresh app during this session. */
    createdInSession: boolean;
    /** The build this session started; only it can be discarded. */
    isBuilding: boolean;
    /** Non-null while the running build is a first build (claimed a fresh app). */
    draft: DataAppVizDraft | null;
    /** Cancels the build and deletes its draft app; null when nothing to discard. */
    discard: (() => void) | null;
    latestReadyVersion: number | null;
    /** True until history has loaded; a null `latestReadyVersion` means
     *  nothing before then. */
    isHistoryLoading: boolean;
    /** True while the latest version is building, this session's own build or
     *  one found already running (e.g. after a reload). */
    isLatestVersionInProgress: boolean;
};

export type UseChartTypeAuthoringExitState = {
    /** A running first build dies with the exit; a revision build survives it. */
    exitDiscardsBuild: boolean;
    isConfirmOpen: boolean;
    /** Opens the confirm while building, otherwise runs `onExit` straight away. */
    requestExit: (onExit: () => void) => void;
    /** "Keep building": closes the confirm without exiting. */
    keepBuilding: () => void;
    /** The confirm's accept path: runs `onExit`, built fresh by the caller
     *  at accept time rather than reused from when the confirm opened. */
    confirmExit: (onExit: () => void) => void;
    /** Discards a running first build, or deletes an abandoned first-session
     *  type. A no-op otherwise; a host calls it wherever its own rule allows. */
    cleanupAbandonedType: () => void;
};

/** The exit behaviour Chart Studio hosts share: a confirm when a build is
 *  running, and cleanup for a build or a type that never went anywhere. */
export const useChartTypeAuthoringExit = ({
    projectUuid,
    dataAppVizUuid,
    createdInSession,
    isBuilding,
    draft,
    discard,
    latestReadyVersion,
    isHistoryLoading,
    isLatestVersionInProgress,
}: UseChartTypeAuthoringExitArgs): UseChartTypeAuthoringExitState => {
    const { mutate: deleteApp } = useDeleteApp();
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const exitDiscardsBuild = isBuilding && draft !== null;

    const cleanupAbandonedType = () => {
        if (exitDiscardsBuild && discard) {
            // A first build still running would leave an orphan behind.
            discard();
        } else if (
            projectUuid &&
            createdInSession &&
            dataAppVizUuid !== null &&
            !isHistoryLoading &&
            !isLatestVersionInProgress &&
            latestReadyVersion === null
        ) {
            // Created here and never got a usable version: nothing to keep.
            deleteApp({
                projectUuid,
                appUuid: dataAppVizUuid,
                successTitle: 'Chart type discarded',
            });
        }
    };

    const requestExit = (onExit: () => void) => {
        if (isBuilding || isLatestVersionInProgress) {
            setIsConfirmOpen(true);
            return;
        }
        onExit();
    };

    const keepBuilding = () => setIsConfirmOpen(false);

    const confirmExit = (onExit: () => void) => {
        setIsConfirmOpen(false);
        onExit();
    };

    return {
        exitDiscardsBuild,
        isConfirmOpen,
        requestExit,
        keepBuilding,
        confirmExit,
        cleanupAbandonedType,
    };
};
