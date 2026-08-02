import { type ApiAgentAsCodeListResponse } from '@lightdash/common';
import { lightdashApi } from '../../../../api';
import { useContentAsCode } from '../../../../features/contentAsCode/hooks/useContentAsCode';

const AI_AGENT_FIELDS_TO_OMIT = ['updatedAt', 'downloadedAt'];

const selectAiAgent = (results: ApiAgentAsCodeListResponse['results']) =>
    results.agents[0];

export const useAiAgentAsCode = ({
    projectUuid,
    agentUuid,
    enabled,
}: {
    projectUuid: string;
    agentUuid: string;
    enabled: boolean;
}) =>
    useContentAsCode<ApiAgentAsCodeListResponse['results']>({
        queryKey: ['ai-agent-as-code', projectUuid, agentUuid],
        queryFn: () =>
            lightdashApi<ApiAgentAsCodeListResponse['results']>({
                method: 'GET',
                url: `/projects/${projectUuid}/code/aiAgents?${new URLSearchParams(
                    [['ids', agentUuid]],
                ).toString()}`,
                body: undefined,
            }),
        selectDocument: selectAiAgent,
        enabled,
        fieldsToOmit: AI_AGENT_FIELDS_TO_OMIT,
    });
