import { useCallback, useEffect, useRef, useState } from 'react';
import type {
    ExternalRequestEvent,
    QueryEvent,
    SdkManifest,
} from './useAppSdkBridge';
import {
    countReadyQueriesSinceBoundary,
    useTrackedAppQueries,
} from './useTrackedAppQueries';
import { useTrackedExternalRequests } from './useTrackedExternalRequests';

/** Bridge callbacks and lineage state to spread onto `AppIframePreview`. */
export type AppInspectorIframeProps = {
    onQueryEvent: (event: QueryEvent) => void;
    onExternalRequestEvent: (event: ExternalRequestEvent) => void;
    onSdkManifest: (manifest: SdkManifest) => void;
    lineageEnabled: boolean;
    onLineageAvailabilityChange: (available: boolean) => void;
    onLineageSelected: (event: { queryUuid: string }) => void;
    lineageHighlightQueryUuid: string | null;
    onLineageCancelled: () => void;
};

/** Tracked logs, actions and lineage state to spread onto `AppInspectorPanel`. */
export type AppInspectorPanelProps = {
    queries: QueryEvent[];
    onClearQueries: () => void;
    externalRequests: ExternalRequestEvent[];
    onClearExternalRequests: () => void;
    persistLogs: boolean;
    onPersistLogsChange: (value: boolean) => void;
    onHoverQuery: (queryUuid: string | null) => void;
    focusedQueryUuid: string | null;
    lineageEnabled: boolean;
    lineageAvailable: boolean;
    lineageSupportedBySdk: boolean;
    onToggleLineage: () => void;
    onDismiss: () => void;
};

export type UseAppInspectorResult = {
    /** Parent-owned visibility: the panel's X (or `hide`) hides it, `show`
     *  re-opens it. */
    hidden: boolean;
    show: () => void;
    hide: () => void;
    /** Persist-aware rollover for a host-triggered iframe reload (manual
     *  refresh). Version switches roll over via `identityKey`. */
    rolloverLogs: () => void;
    /** `ready` queries since the last version switch, unaffected by rows
     *  Persist carried over from a previous bundle. */
    readyQueryCount: number;
    iframeProps: AppInspectorIframeProps;
    panelProps: AppInspectorPanelProps;
};

/**
 * Inspector wiring for an app preview host: tracks bridge query and
 * external-request events, owns lineage ("Inspect data") state and rolls the
 * logs over when the served bundle changes. Shared by the app viewer page and
 * the AI thread preview; the builder keeps its own wiring.
 *
 * @param identityKey - app uuid + version of the served bundle, the same value
 * as `AppIframePreview`'s `identityKey`. A change rolls the logs over: cleared
 * by default, kept with in-flight rows interrupted when Persist is on. Never
 * rolls over on mount.
 */
export const useAppInspector = ({
    identityKey,
    defaultHidden,
}: {
    identityKey: string;
    defaultHidden: boolean;
}): UseAppInspectorResult => {
    const {
        queries,
        persistLogs,
        setPersistLogs,
        handleQueryEvent,
        clearQueries,
        resetQueries,
        interruptInFlightQueries,
    } = useTrackedAppQueries();
    const {
        externalRequests,
        handleExternalRequestEvent,
        clearExternalRequests,
        interruptInFlightRequests,
    } = useTrackedExternalRequests();

    const [hidden, setHidden] = useState(defaultHidden);
    const [lineageEnabled, setLineageEnabled] = useState(false);
    const [lineageAvailable, setLineageAvailable] = useState(false);
    const [sdkManifest, setSdkManifest] = useState<SdkManifest | null>(null);
    const [hoveredQueryUuid, setHoveredQueryUuid] = useState<string | null>(
        null,
    );
    const [focusedQueryUuid, setFocusedQueryUuid] = useState<string | null>(
        null,
    );
    const [readyQueryBoundary, setReadyQueryBoundary] = useState(0);

    const queriesRef = useRef(queries);
    queriesRef.current = queries;

    // Matches the builder: a version switch moves the ready-count boundary so
    // persisted rows from the old bundle don't count; a manual refresh doesn't.
    const rollover = useCallback(
        (newBundle: boolean) => {
            setFocusedQueryUuid(null);
            if (persistLogs) {
                interruptInFlightQueries();
                interruptInFlightRequests();
                if (newBundle) {
                    setReadyQueryBoundary(
                        queriesRef.current.filter((q) => q.status === 'ready')
                            .length,
                    );
                }
                return;
            }
            // resetQueries (not clearQueries) so a late terminal event from
            // the still-running parent-owned fetch can't land as a phantom row.
            resetQueries();
            clearExternalRequests();
            setReadyQueryBoundary(0);
        },
        [
            persistLogs,
            interruptInFlightQueries,
            interruptInFlightRequests,
            resetQueries,
            clearExternalRequests,
        ],
    );
    const rolloverLogs = useCallback(() => rollover(false), [rollover]);

    // The iframe is an external system: a new bundle means new logs and a
    // fresh manifest. Skips mount so queries fired during initial load stay.
    const previousIdentityKeyRef = useRef(identityKey);
    useEffect(() => {
        if (previousIdentityKeyRef.current === identityKey) return;
        previousIdentityKeyRef.current = identityKey;
        setSdkManifest(null);
        rollover(true);
    }, [identityKey, rollover]);

    const show = useCallback(() => setHidden(false), []);
    const hide = useCallback(() => setHidden(true), []);

    const handleToggleLineage = useCallback(() => {
        setLineageEnabled((v) => !v);
        setFocusedQueryUuid(null);
    }, []);
    const handleLineageSelected = useCallback(
        (event: { queryUuid: string }) => {
            setHidden(false);
            // Re-clicking the selected element deselects it.
            setFocusedQueryUuid((prev) =>
                prev === event.queryUuid ? null : event.queryUuid,
            );
        },
        [],
    );
    const handleLineageCancelled = useCallback(() => {
        setLineageEnabled(false);
        setFocusedQueryUuid(null);
    }, []);

    return {
        hidden,
        show,
        hide,
        rolloverLogs,
        readyQueryCount: countReadyQueriesSinceBoundary(
            queries,
            readyQueryBoundary,
        ),
        iframeProps: {
            onQueryEvent: handleQueryEvent,
            onExternalRequestEvent: handleExternalRequestEvent,
            onSdkManifest: setSdkManifest,
            lineageEnabled,
            onLineageAvailabilityChange: setLineageAvailable,
            onLineageSelected: handleLineageSelected,
            // Hover overrides the persistent click-selection.
            lineageHighlightQueryUuid: hoveredQueryUuid ?? focusedQueryUuid,
            onLineageCancelled: handleLineageCancelled,
        },
        panelProps: {
            queries,
            onClearQueries: clearQueries,
            externalRequests,
            onClearExternalRequests: clearExternalRequests,
            persistLogs,
            onPersistLogsChange: setPersistLogs,
            onHoverQuery: setHoveredQueryUuid,
            focusedQueryUuid,
            lineageEnabled,
            lineageAvailable,
            lineageSupportedBySdk:
                sdkManifest?.features.includes('lineage') ?? false,
            onToggleLineage: handleToggleLineage,
            onDismiss: hide,
        },
    };
};
