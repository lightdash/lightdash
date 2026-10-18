import {
    type ApiAiAgentComposerPivotRequest,
    type ApiAiAgentComposerPivotResponse,
    type ApiError,
    type PivotConfiguration,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../../api';
import { getAiAgentApiBase } from '../../hooks/aiAgentRouting';
import { type AiAgentArtifactVersionRef } from '../../hooks/useAiAgentArtifacts';

const runComposerPivot = async (
    {
        projectUuid,
        agentUuid,
        artifactUuid,
        versionUuid,
    }: AiAgentArtifactVersionRef,
    body: ApiAiAgentComposerPivotRequest,
) =>
    lightdashApi<ApiAiAgentComposerPivotResponse['results']>({
        url: `${getAiAgentApiBase(projectUuid)}/${agentUuid}/artifacts/${artifactUuid}/versions/${versionUuid}/pivot-query`,
        method: 'POST',
        body: JSON.stringify(body),
    });

/**
 * The pivoted re-run of a node result, on the compose engine, as the chart
 * needs it: idle without a result or a pivot to run. The server runs it as
 * the artifact owner, so a viewer needs no query permission of their own.
 */
export const useComposerPivotQuery = ({
    artifact,
    sourceQueryUuid,
    pivotConfiguration,
}: {
    artifact: AiAgentArtifactVersionRef;
    sourceQueryUuid: string | null;
    /** Addressed by result column. */
    pivotConfiguration: PivotConfiguration | null;
}) =>
    useQuery<{ queryUuid: string }, ApiError>({
        queryKey: [
            'aiAgentComposerPivot',
            artifact.projectUuid,
            artifact.artifactUuid,
            artifact.versionUuid,
            sourceQueryUuid,
            pivotConfiguration,
        ],
        queryFn: () =>
            sourceQueryUuid && pivotConfiguration
                ? runComposerPivot(artifact, {
                      sourceQueryUuid,
                      pivotConfiguration,
                  })
                : Promise.reject(new Error('Nothing to pivot')),
        enabled: sourceQueryUuid !== null && pivotConfiguration !== null,
        staleTime: Infinity,
        retry: false,
    });
