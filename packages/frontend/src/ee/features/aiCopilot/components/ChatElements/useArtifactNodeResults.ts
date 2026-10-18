import { FeatureFlags } from '@lightdash/common';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import useIsEmbedded from '../../../../providers/Embed/useIsEmbedded';
import { getAiAgentArtifactResultsUrl } from '../../hooks/aiAgentRouting';
import { type AiAgentArtifactVersionRef } from '../../hooks/useAiAgentArtifacts';

/**
 * Every row of one node result of an artifact run. With agent identity on,
 * the rows are read through the artifact, as its owner ran them.
 */
export const useArtifactNodeResults = (
    artifact: AiAgentArtifactVersionRef,
    queryUuid: string | null,
) => {
    const isEmbed = useIsEmbedded();
    const identityFlag = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    const identityEnabled = identityFlag.data?.enabled === true;
    return useInfiniteQueryResults(
        artifact.projectUuid,
        isEmbed || !identityFlag.isLoading
            ? (queryUuid ?? undefined)
            : undefined,
        undefined,
        identityEnabled && !isEmbed && queryUuid
            ? getAiAgentArtifactResultsUrl({
                  projectUuid: artifact.projectUuid,
                  agentUuid: artifact.agentUuid,
                  artifactUuid: artifact.artifactUuid,
                  versionUuid: artifact.versionUuid,
                  queryUuid,
                  cached: false,
              })
            : null,
    );
};
