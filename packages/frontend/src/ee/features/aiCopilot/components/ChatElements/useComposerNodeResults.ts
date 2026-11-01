import { assertUnreachable, FeatureFlags } from '@lightdash/common';
import {
    useInfiniteQueryResults,
    type InfiniteQueryResults,
} from '../../../../../hooks/useQueryResults';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import useIsEmbedded from '../../../../providers/Embed/useIsEmbedded';
import {
    getAiAgentArtifactResultsUrl,
    getAiAgentMessageQueryResultsUrl,
} from '../../hooks/aiAgentRouting';

/** What the panel shows: a saved artifact version, or a pipeline a message ran. */
export type ComposerPanelSource =
    | { kind: 'artifact'; artifactUuid: string; versionUuid: string }
    | {
          kind: 'messageQuery';
          threadUuid: string;
          messageUuid: string;
          queryUuid: string;
      };

const getResultsUrl = ({
    projectUuid,
    agentUuid,
    source,
    queryUuid,
}: {
    projectUuid: string;
    agentUuid: string;
    source: ComposerPanelSource;
    queryUuid: string;
}) => {
    switch (source.kind) {
        case 'artifact':
            return getAiAgentArtifactResultsUrl({
                projectUuid,
                agentUuid,
                artifactUuid: source.artifactUuid,
                versionUuid: source.versionUuid,
                queryUuid,
                cached: false,
            });
        case 'messageQuery':
            return getAiAgentMessageQueryResultsUrl({
                projectUuid,
                agentUuid,
                threadUuid: source.threadUuid,
                messageUuid: source.messageUuid,
                queryUuid: source.queryUuid,
                resultQueryUuid: queryUuid,
            });
        default:
            return assertUnreachable(source, 'Unknown composer panel source');
    }
};

/** One node's result in a run; agent identity reads it through the agent's results route. */
export const useComposerNodeResults = ({
    projectUuid,
    agentUuid,
    source,
    queryUuid,
}: {
    projectUuid: string;
    agentUuid: string;
    source: ComposerPanelSource;
    queryUuid: string | undefined;
}): InfiniteQueryResults => {
    const isEmbed = useIsEmbedded();
    const identityFlag = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    const identityEnabled = identityFlag.data?.enabled === true;
    return useInfiniteQueryResults(
        projectUuid,
        isEmbed || !identityFlag.isLoading ? queryUuid : undefined,
        undefined,
        identityEnabled && !isEmbed && queryUuid
            ? getResultsUrl({ projectUuid, agentUuid, source, queryUuid })
            : null,
    );
};
