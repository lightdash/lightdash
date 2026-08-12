import {
    DEFAULT_DATA_APP_CLAUDE_MODEL,
    resolveDefaultDataAppClaudeModel,
    type DataAppClaudeModel,
} from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';
import { useAiOrganizationSettings } from '../../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';

const NO_MODELS: DataAppClaudeModel[] = [];

type Args = {
    /** The app the picker is for; null before the first build claims one. */
    appUuid: string | null;
    /** The most recent version's persisted model, whatever its status — a
     *  still-building version's model is already a valid signal of intent. */
    latestVersionModel: DataAppClaudeModel | null;
};

export type DataAppModelSelection = {
    /** What the next submit sends. */
    selectedModel: DataAppClaudeModel;
    /** Models the org admin left visible; empty while still loading. */
    visibleModels: DataAppClaudeModel[];
    /** Loading and unrestricted are indistinguishable until the org settings
     *  resolve, so surfaces disable the picker rather than offer a model the
     *  server would then reject. */
    isLoading: boolean;
    setModel: (model: DataAppClaudeModel) => void;
    /** Drops the pick so the next app derives its own. Surfaces that stay
     *  mounted across apps must call this when they navigate between them. */
    clearPick: () => void;
};

/**
 * The Claude model a data-app surface builds with: explicit pick > the latest
 * version's persisted model > the org-visible default, skipping any model an
 * admin has since hidden. Pure derivation, keyed by app uuid.
 *
 * A pick keyed `null` was made before any app existed and keeps matching once
 * the uuid materialises, so the picker doesn't flash the default mid-submit.
 */
export const useDataAppModelSelection = ({
    appUuid,
    latestVersionModel,
}: Args): DataAppModelSelection => {
    const [pick, setPick] = useState<{
        appUuid: string | null;
        model: DataAppClaudeModel;
    } | null>(null);

    const { data: aiOrganizationSettings, isLoading } =
        useAiOrganizationSettings();
    const visibleModels =
        aiOrganizationSettings?.visibleDataAppModels ?? NO_MODELS;

    const selectedModel = useMemo(() => {
        if (
            pick &&
            (pick.appUuid === null || pick.appUuid === appUuid) &&
            visibleModels.includes(pick.model)
        ) {
            return pick.model;
        }
        if (latestVersionModel && visibleModels.includes(latestVersionModel)) {
            return latestVersionModel;
        }
        return (
            resolveDefaultDataAppClaudeModel(visibleModels) ??
            DEFAULT_DATA_APP_CLAUDE_MODEL
        );
    }, [pick, appUuid, latestVersionModel, visibleModels]);

    const setModel = useCallback(
        (model: DataAppClaudeModel) => setPick({ appUuid, model }),
        [appUuid],
    );

    const clearPick = useCallback(() => setPick(null), []);

    return { selectedModel, visibleModels, isLoading, setModel, clearPick };
};
