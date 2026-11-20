import {
    type AgentPermissionRequest,
    type AgentPermissionService,
} from './AgentPermissionService';

type AgentOperation = Parameters<
    AgentPermissionService['assertOperationWithRequest']
>[0]['operation'];

export const isAgentOperationOff = (
    request: Pick<AgentPermissionRequest, 'enforcementMode'>,
): boolean => request.enforcementMode === 'off';

export const assertAgentOperation = async (
    permissions: Pick<
        AgentPermissionService,
        'loadRequest' | 'assertOperationWithRequest'
    >,
    organizationUuid: string,
    buildOperation: () => AgentOperation,
): Promise<void> => {
    const request = await permissions.loadRequest(organizationUuid);
    if (isAgentOperationOff(request)) return;
    await permissions.assertOperationWithRequest({
        request,
        operation: buildOperation(),
    });
};
