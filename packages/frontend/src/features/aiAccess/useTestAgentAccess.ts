import {
    type AgentAccessReport,
    type AgentAccessTestRequest,
    type ApiError,
    type UUID,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

export const useTestAgentAccess = (
    projectUuid: UUID,
    connection: UUID | null,
) => {
    const lightdashApi = useLightdashApi();
    return useMutation<AgentAccessReport, ApiError, AgentAccessTestRequest>({
        mutationFn: (request) => {
            const query = new URLSearchParams();
            if (connection !== null) query.set('connection', connection);
            return lightdashApi<AgentAccessReport>({
                version: 'v2',
                url: `/projects/${encodeURIComponent(projectUuid)}/ai-access/service-account/test-access${query.size ? `?${query}` : ''}`,
                method: 'POST',
                body: JSON.stringify(request),
                sensitive: true,
            });
        },
        retry: false,
    });
};
