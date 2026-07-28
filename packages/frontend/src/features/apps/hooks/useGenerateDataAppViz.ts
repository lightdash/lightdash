import {
    DATA_APP_VIZ_TEMPLATE,
    getErrorMessage,
    type DataAppVizFieldMapping,
    type ItemsMap,
} from '@lightdash/common';
import { useCallback, useState } from 'react';
import { autoMapDataAppVizFields } from '../utils/autoMapDataAppVizFields';
import {
    buildVizGenerationPrompt,
    type VizPromptColumn,
} from '../utils/buildVizGenerationPrompt';
import { useAppBuildPoller } from './useAppBuildPoller';
import { useGenerateApp } from './useGenerateApp';
import { useGetApp } from './useGetApp';

type Args = {
    projectUuid: string | undefined;
    itemsMap: ItemsMap;
    /** Called once the build lands ready, with the contract already bound. */
    onReady: (
        dataAppVizUuid: string,
        fieldMapping: DataAppVizFieldMapping,
    ) => void;
};

export type GenerateDataAppVizState = {
    /** Uuid of the viz being built; null when nothing is in flight. */
    buildingUuid: string | null;
    /** The request in flight, so the conversation can show it immediately. */
    pendingPrompt: string | null;
    isBuilding: boolean;
    /** Why the last attempt failed, for the thread's error receipt. */
    error: string | null;
    generate: (description: string, columns: VizPromptColumn[]) => void;
};

/**
 * Generate a new data app viz from the chart's own query, then hand the caller
 * a contract already bound to the result columns.
 *
 * No `spaceUuid` is sent: an Explorer-authored viz is personal, exactly as one
 * created in the generator is, and is filed into a space afterwards.
 */
export const useGenerateDataAppViz = ({
    projectUuid,
    itemsMap,
    onReady,
}: Args): GenerateDataAppVizState => {
    const [buildingUuid, setBuildingUuid] = useState<string | null>(null);
    const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { mutate: generateApp, isLoading: isSubmitting } = useGenerateApp();

    // The poller writes into the same cache key the renderer reads, so the
    // chart picks up the finished build without any wiring of its own.
    const { data: appData } = useGetApp(projectUuid, buildingUuid ?? undefined);

    const handleDone = useCallback(
        (version: number, status: string) => {
            const built = appData?.pages
                .flatMap((page) => page.versions)
                .find((v) => v.version === version);
            const uuid = buildingUuid;
            setBuildingUuid(null);
            setPendingPrompt(null);
            if (status !== 'ready' || !uuid) {
                setError(
                    built?.statusMessage ??
                        built?.error ??
                        'Generation failed. Please try again.',
                );
                return;
            }
            onReady(
                uuid,
                autoMapDataAppVizFields(
                    built?.resources?.vizSchema?.fields ?? [],
                    itemsMap,
                ),
            );
        },
        [appData?.pages, buildingUuid, itemsMap, onReady],
    );

    useAppBuildPoller(
        projectUuid,
        buildingUuid ?? undefined,
        buildingUuid !== null,
        handleDone,
    );

    const generate = useCallback(
        (description: string, columns: VizPromptColumn[]) => {
            if (!projectUuid || buildingUuid !== null) return;
            setError(null);
            // The author's own words, not the column manifest appended below.
            setPendingPrompt(description);
            generateApp(
                {
                    projectUuid,
                    prompt: buildVizGenerationPrompt(description, columns),
                    template: DATA_APP_VIZ_TEMPLATE,
                },
                {
                    onSuccess: ({ appUuid }) => setBuildingUuid(appUuid),
                    onError: (err) => {
                        setPendingPrompt(null);
                        setError(getErrorMessage(err));
                    },
                },
            );
        },
        [projectUuid, buildingUuid, generateApp],
    );

    return {
        buildingUuid,
        pendingPrompt,
        isBuilding: isSubmitting || buildingUuid !== null,
        error,
        generate,
    };
};
