import { subject } from '@casl/ability';
import {
    FeatureFlags,
    getComposerChartSaveDraft,
    getComposerPipelineWriteDeniedReason,
    savesAsComposerChart,
    type AiComposerChartArtifactConfig,
    type ComposerChartSaveCustomChartType,
    type ComposerChartPipeline,
    type ComposerStoredChart,
    type ResultColumn,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useDataAppVizRenderMetadata } from '../../../../../features/chartTypes/hooks/useDataAppVizRender';
import { type SavedComposerChartLink } from '../../../../../features/composerCharts/components/SaveComposerChartModal';
import { useContentAuthoringEnabled } from '../../../../../hooks/useContentAuthoringEnabled';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../../providers/App/useApp';
import useIsEmbedded from '../../../../providers/Embed/useIsEmbedded';
import { useUpdateArtifactVersionSavedComposerChart } from '../../hooks/useProjectAiAgents';
import { type ComposerPanelSource } from './useComposerNodeResults';

export type ComposerChartSaveAction =
    | { kind: 'saved'; dashboardUuid: string }
    | {
          kind: 'save';
          /** Shown on the disabled Save; null when Save is enabled. */
          disabledReason: string | null;
          draft: {
              pipeline: ComposerChartPipeline;
              chart: ComposerStoredChart;
          } | null;
          link: (saved: SavedComposerChartLink) => Promise<void>;
      };

const AUTHORING_RENDER_TARGET = {
    isEmbedded: false,
    savedChartUuid: undefined,
};

type Args = {
    projectUuid: string;
    agentUuid: string;
    source: ComposerPanelSource;
    config: AiComposerChartArtifactConfig;
    columns: ResultColumn[];
    title: string;
    description: string | null;
    savedComposerChart: SavedComposerChartLink | null;
};

/** Save for an answer that saves as a composer chart; null when it saves another way or not at all. */
export const useComposerChartSaveAction = ({
    projectUuid,
    agentUuid,
    source,
    config,
    columns,
    title,
    description,
    savedComposerChart,
}: Args): ComposerChartSaveAction | null => {
    const { user } = useApp();
    const isEmbed = useIsEmbedded();
    const authoringEnabled = useContentAuthoringEnabled();
    const { data: flag } = useServerFeatureFlag(FeatureFlags.ComposerCharts);
    const { mutateAsync: linkChart } =
        useUpdateArtifactVersionSavedComposerChart(
            projectUuid,
            agentUuid,
            source.kind === 'artifact' ? source.artifactUuid : '',
            source.kind === 'artifact' ? source.versionUuid : '',
        );

    // The pinned version's slot kinds decide which columns are metrics and which split.
    const customVizConfig =
        config.vizConfig?.type === 'custom' ? config.vizConfig : null;
    const { data: renderMetadata, error: renderMetadataError } =
        useDataAppVizRenderMetadata(
            projectUuid,
            customVizConfig?.dataAppVizUuid ?? null,
            AUTHORING_RENDER_TARGET,
            customVizConfig?.dataAppVizVersion ?? undefined,
        );
    const customChartType =
        useMemo((): ComposerChartSaveCustomChartType | null => {
            if (renderMetadataError) {
                return {
                    status: 'unavailable',
                    reason:
                        renderMetadataError.error.statusCode === 404
                            ? 'The chart type this answer uses has been removed'
                            : renderMetadataError.error.message,
                };
            }
            if (renderMetadata?.state === 'ready') {
                return { status: 'ready', slots: renderMetadata.schema.fields };
            }
            if (renderMetadata?.state === 'unavailable') {
                return {
                    status: 'unavailable',
                    reason: 'The chart type version this answer uses is unavailable',
                };
            }
            return null;
        }, [renderMetadata, renderMetadataError]);

    const draft = useMemo(
        () =>
            getComposerChartSaveDraft({
                config,
                columns,
                metadata: { title, description: description ?? '' },
                customChartType,
            }),
        [config, columns, title, description, customChartType],
    );

    if (
        source.kind !== 'artifact' ||
        isEmbed ||
        !authoringEnabled ||
        flag?.enabled !== true ||
        !savesAsComposerChart(config)
    ) {
        return null;
    }
    if (savedComposerChart) {
        return {
            kind: 'saved',
            dashboardUuid: savedComposerChart.dashboardUuid,
        };
    }
    const link = async (saved: SavedComposerChartLink) => {
        await linkChart({ savedComposerChartUuid: saved.composerChartUuid });
    };
    if (draft.status === 'unavailable') {
        return {
            kind: 'save',
            disabledReason: draft.reason,
            draft: null,
            link,
        };
    }
    const ability = user.data?.ability;
    const deniedReason = getComposerPipelineWriteDeniedReason(
        draft.pipeline,
        (subjectName) =>
            !ability ||
            ability.cannot(
                'manage',
                subject(subjectName, {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid,
                }),
            ),
    );
    return {
        kind: 'save',
        disabledReason: deniedReason,
        draft: { pipeline: draft.pipeline, chart: draft.chart },
        link,
    };
};
