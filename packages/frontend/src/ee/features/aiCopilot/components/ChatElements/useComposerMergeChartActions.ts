import {
    getComposerMergeSavedChart,
    type AiComposerChartArtifactConfig,
    type ApiError,
    type ComposerMergeSavedChart,
    type ResultColumn,
} from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';
import { getExploreFromHereUrl } from '../../../../../features/mergeQuery/utils/getExploreFromHereUrl';
import useToaster from '../../../../../hooks/toaster/useToaster';
import { useContentAuthoringEnabled } from '../../../../../hooks/useContentAuthoringEnabled';
import useCreateInAnySpaceAccess from '../../../../../hooks/user/useCreateInAnySpaceAccess';
import { useCreateShareMutation } from '../../../../../hooks/useShare';
import useIsEmbedded from '../../../../providers/Embed/useIsEmbedded';
import { useAddChartToDashboard } from '../../hooks/useAddChartToDashboard';
import {
    requestDashboardRefresh,
    type LauncherCurrentDashboard,
} from '../../store/aiAgentLauncherSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';

type Args = {
    projectUuid: string;
    config: AiComposerChartArtifactConfig;
    /** The presented node's result columns; empty until they load. */
    columns: ResultColumn[];
    title: string;
    description: string | null;
};

export type ComposerMergeChartActions = {
    savedData: ComposerMergeSavedChart;
    canSave: boolean;
    quickSaveDashboard: LauncherCurrentDashboard | null;
    isSavingToDashboard: boolean;
    saveToCurrentDashboard: () => Promise<void>;
    exploreFromHere: () => Promise<void>;
};

/**
 * Save and Explore from here for a version presenting a merge node: it saves
 * and opens as an ordinary merged chart. Null when there is nothing to offer.
 * Full app only, like a classic merge artifact's explore action.
 */
export const useComposerMergeChartActions = ({
    projectUuid,
    config,
    columns,
    title,
    description,
}: Args): ComposerMergeChartActions | null => {
    const isEmbed = useIsEmbedded();
    const authoringEnabled = useContentAuthoringEnabled();
    const canSaveChart = useCreateInAnySpaceAccess(projectUuid, 'SavedChart');
    const { showToastSuccess, showToastApiError } = useToaster();
    const dispatch = useAiAgentStoreDispatch();
    const currentDashboard = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.currentDashboard,
    );
    const addChartToDashboard = useAddChartToDashboard(projectUuid);
    const { mutateAsync: createShareUrl } = useCreateShareMutation();
    const [isSavingToDashboard, setIsSavingToDashboard] = useState(false);

    const savedData = useMemo(
        () =>
            getComposerMergeSavedChart({
                config,
                columns,
                metadata: { title, description: description ?? '' },
            }),
        [config, columns, title, description],
    );
    const quickSaveDashboard =
        currentDashboard?.projectUuid === projectUuid ? currentDashboard : null;

    const saveToCurrentDashboard = useCallback(async () => {
        if (!savedData || !quickSaveDashboard) return;
        setIsSavingToDashboard(true);
        try {
            const chart = await addChartToDashboard({
                savedData,
                name: title,
                description,
                dashboardUuid: quickSaveDashboard.uuid,
                activeTabUuid: quickSaveDashboard.activeTabUuid,
            });
            dispatch(
                requestDashboardRefresh({
                    dashboardUuid: quickSaveDashboard.uuid,
                    focusChartSlug: chart.slug,
                }),
            );
            showToastSuccess({
                title: `Chart added to "${quickSaveDashboard.name}"`,
            });
        } catch (e) {
            showToastApiError({
                title: 'Failed to add chart to dashboard',
                apiError: (e as ApiError).error,
            });
        } finally {
            setIsSavingToDashboard(false);
        }
    }, [
        savedData,
        quickSaveDashboard,
        addChartToDashboard,
        title,
        description,
        dispatch,
        showToastSuccess,
        showToastApiError,
    ]);

    const exploreFromHere = useCallback(async () => {
        if (!savedData) return;
        const url = getExploreFromHereUrl({ ...savedData, projectUuid });
        const shareUrl = await createShareUrl({
            path: url.pathname,
            params: `?${url.search}`,
        });
        window.open(`/share/${shareUrl.nanoid}`, '_blank');
    }, [savedData, projectUuid, createShareUrl]);

    if (!savedData || isEmbed || !authoringEnabled) return null;
    return {
        savedData,
        canSave: canSaveChart,
        quickSaveDashboard,
        isSavingToDashboard,
        saveToCurrentDashboard,
        exploreFromHere,
    };
};
