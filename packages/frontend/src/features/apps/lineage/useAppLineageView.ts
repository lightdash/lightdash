import {
    type AppSdkLineageHighlight,
    type AppSdkLineageSelection,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PipelineEvent, QueryEvent } from '../hooks/useAppSdkBridge';
import {
    findPipelineForSelection,
    highlightOf,
    toDataAppPipelines,
    type DataAppPipeline,
} from './dataAppPipelines';

export type AppView = 'app' | 'lineage';

/** A request to scroll the notebook to a node; `seq` re-fires the same node. */
export type LineageFocusRequest = {
    pipelineId: string;
    nodeId: string;
    seq: number;
};

const SHOW_IN_APP_HIGHLIGHT_MS = 2000;

export type UseAppLineageViewResult = {
    view: AppView;
    setView: (view: AppView) => void;
    canShowLineage: boolean;
    pipelines: DataAppPipeline[];
    selectedPipeline: DataAppPipeline | null;
    selectPipeline: (pipelineId: string) => void;
    focusRequest: LineageFocusRequest | null;
    /** Hovering a pipeline or node outlines its elements in the app. */
    hover: (pipeline: DataAppPipeline | null, nodeId: string | null) => void;
    showInApp: (pipeline: DataAppPipeline, nodeId: string | null) => void;
    /** What the iframe should outline; null leaves the inspector's own. */
    highlight: AppSdkLineageHighlight | null;
    /** Wire to the iframe's `onLineageSelected` (inspect-data clicks). */
    handleLineageSelected: (selection: AppSdkLineageSelection) => void;
};

/**
 * App | Lineage view state for an app host page: which view shows, which
 * pipeline is open, and the highlight that links lineage back to the app.
 * Resets to the app view when the served bundle (`identityKey`) changes.
 */
export const useAppLineageView = ({
    identityKey,
    queries,
    pipelineEvents,
}: {
    identityKey: string;
    queries: QueryEvent[];
    pipelineEvents: PipelineEvent[];
}): UseAppLineageViewResult => {
    const pipelines = useMemo(
        () => toDataAppPipelines(queries, pipelineEvents),
        [queries, pipelineEvents],
    );
    const [view, setView] = useState<AppView>('app');
    const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(
        null,
    );
    const [focusRequest, setFocusRequest] =
        useState<LineageFocusRequest | null>(null);
    const [hoverHighlight, setHoverHighlight] =
        useState<AppSdkLineageHighlight | null>(null);
    const [flashHighlight, setFlashHighlight] =
        useState<AppSdkLineageHighlight | null>(null);
    const flashTimer = useRef<number | undefined>(undefined);
    const focusSeq = useRef(0);

    const previousIdentityKeyRef = useRef(identityKey);
    useEffect(() => {
        if (previousIdentityKeyRef.current === identityKey) return;
        previousIdentityKeyRef.current = identityKey;
        setView('app');
        setSelectedPipelineId(null);
        setFocusRequest(null);
        setHoverHighlight(null);
        setFlashHighlight(null);
    }, [identityKey]);
    useEffect(() => () => window.clearTimeout(flashTimer.current), []);

    const selectPipeline = useCallback((pipelineId: string) => {
        setSelectedPipelineId(pipelineId);
        setFocusRequest(null);
    }, []);

    const hover = useCallback(
        (pipeline: DataAppPipeline | null, nodeId: string | null) =>
            setHoverHighlight(pipeline ? highlightOf(pipeline, nodeId) : null),
        [],
    );

    const showInApp = useCallback(
        (pipeline: DataAppPipeline, nodeId: string | null) => {
            setView('app');
            setHoverHighlight(null);
            setFlashHighlight(highlightOf(pipeline, nodeId));
            window.clearTimeout(flashTimer.current);
            flashTimer.current = window.setTimeout(
                () => setFlashHighlight(null),
                SHOW_IN_APP_HIGHLIGHT_MS,
            );
        },
        [],
    );

    const pipelinesRef = useRef(pipelines);
    pipelinesRef.current = pipelines;
    const handleLineageSelected = useCallback(
        (selection: AppSdkLineageSelection) => {
            const match = findPipelineForSelection(
                pipelinesRef.current,
                selection,
            );
            if (!match) return;
            focusSeq.current += 1;
            setView('lineage');
            setSelectedPipelineId(match.id);
            setFocusRequest({
                pipelineId: match.id,
                nodeId: match.terminalNodeId,
                seq: focusSeq.current,
            });
        },
        [],
    );

    // Defaults to the newest pipeline until one is picked.
    const selectedPipeline =
        pipelines.find((p) => p.id === selectedPipelineId) ??
        pipelines[pipelines.length - 1] ??
        null;

    return {
        view,
        setView,
        canShowLineage: pipelines.length > 0,
        pipelines,
        selectedPipeline,
        selectPipeline,
        focusRequest,
        hover,
        showInApp,
        highlight: hoverHighlight ?? flashHighlight,
        handleLineageSelected,
    };
};
