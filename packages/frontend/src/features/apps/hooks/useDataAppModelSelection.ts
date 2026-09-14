import {
    DATA_APP_CODEX_MODELS,
    DEFAULT_DATA_APP_CLAUDE_MODEL,
    DEFAULT_DATA_APP_CODEX_MODEL,
    resolveDefaultDataAppClaudeModel,
    type DataAppClaudeModel,
    type DataAppCodexModel,
    type DataAppCodingAgent,
    type DataAppCodingAgentModel,
} from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';
import { useAiOrganizationSettings } from '../../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';

const NO_MODELS: DataAppClaudeModel[] = [];
const CODEX_MODELS: DataAppCodexModel[] = [...DATA_APP_CODEX_MODELS];

type Args = {
    /** The app the picker is for; null before the first build claims one. */
    appUuid: string | null;
    /** The most recent version's persisted model, whatever its status — a
     *  still-building version's model is already a valid signal of intent. */
    latestVersionModel: DataAppCodingAgentModel | null;
};

export type DataAppModelSelection = {
    codingAgent: DataAppCodingAgent;
    /** What the next submit sends. */
    selectedModel: DataAppCodingAgentModel;
    /** Provider-specific request field. Claude and Codex remain separate on
     *  the wire so Claude's existing contract is unchanged. */
    modelRequest:
        | { claudeModel: DataAppClaudeModel; codexModel?: never }
        | { codexModel: DataAppCodexModel; claudeModel?: never };
    /** Models the org admin left visible; empty while still loading. */
    visibleModels: DataAppCodingAgentModel[];
    /** Loading and unrestricted are indistinguishable until the org settings
     *  resolve, so surfaces disable the picker rather than offer a model the
     *  server would then reject. */
    isLoading: boolean;
    setModel: (model: DataAppCodingAgentModel) => void;
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
        model: DataAppCodingAgentModel;
    } | null>(null);

    const { data: aiOrganizationSettings, isLoading } =
        useAiOrganizationSettings();
    const codingAgent =
        aiOrganizationSettings?.dataAppCodingAgent ?? ('claude' as const);
    const visibleClaudeModels =
        aiOrganizationSettings?.visibleDataAppModels ?? NO_MODELS;
    const visibleModels: DataAppCodingAgentModel[] =
        codingAgent === 'codex' ? CODEX_MODELS : visibleClaudeModels;

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
        return codingAgent === 'codex'
            ? DEFAULT_DATA_APP_CODEX_MODEL
            : (resolveDefaultDataAppClaudeModel(visibleClaudeModels) ??
                  DEFAULT_DATA_APP_CLAUDE_MODEL);
    }, [
        pick,
        appUuid,
        latestVersionModel,
        visibleModels,
        visibleClaudeModels,
        codingAgent,
    ]);

    const setModel = useCallback(
        (model: DataAppCodingAgentModel) => setPick({ appUuid, model }),
        [appUuid],
    );

    const clearPick = useCallback(() => setPick(null), []);

    const modelRequest: DataAppModelSelection['modelRequest'] =
        codingAgent === 'codex'
            ? { codexModel: selectedModel as DataAppCodexModel }
            : { claudeModel: selectedModel as DataAppClaudeModel };

    return {
        codingAgent,
        selectedModel,
        modelRequest,
        visibleModels,
        isLoading,
        setModel,
        clearPick,
    };
};
