import {
    AiIdentityCreationMode,
    AiIdentityProvisionerFindingReason,
    AiIdentityProvisionerStatus,
    type AiIdentityProvisioningSettings,
    type AiIdentityProvisioningOperation,
    type UpdateAiIdentityRoleMapping,
} from '@lightdash/common';

export const provisionerStatusLabels: Record<
    AiIdentityProvisionerStatus,
    string
> = {
    [AiIdentityProvisionerStatus.NOT_SET_UP]: 'Not set up',
    [AiIdentityProvisionerStatus.WAITING_FOR_SETUP]: 'Waiting for setup',
    [AiIdentityProvisionerStatus.READY]: 'Ready',
    [AiIdentityProvisionerStatus.FAILING]: 'Failing',
    [AiIdentityProvisionerStatus.REVOKED]: 'Revoked',
};
export const findingLabels: Record<AiIdentityProvisionerFindingReason, string> =
    {
        [AiIdentityProvisionerFindingReason.NOT_SERVICE_AGENT]:
            'Not an AI user (TYPE is not SERVICE_AGENT)',
        [AiIdentityProvisionerFindingReason.NOT_CREATED_BY_LIGHTDASH]:
            'Not created by Lightdash',
    };
export const operationLabels: Record<
    AiIdentityProvisioningOperation['kind'],
    string
> = {
    create_user: 'Create AI user',
    set_public_key: 'Set public key',
    set_default_role: 'Set default role',
    grant_role: 'Grant AI role',
    revoke_role: 'Revoke AI role',
    drop_user: 'Drop AI user',
};
export const isProvisioningFallback = (
    settings: AiIdentityProvisioningSettings,
) =>
    settings.mode === AiIdentityCreationMode.AUTOMATIC &&
    settings.effectiveMode === AiIdentityCreationMode.GUIDED;
export const needsProvisioningApproval = (
    settings: AiIdentityProvisioningSettings,
) => !settings.provisioner?.firstRunApprovedAt;
export const orderMappings = (mappings: UpdateAiIdentityRoleMapping[]) =>
    mappings.map((mapping, priority) => ({
        ...mapping,
        aiRole: mapping.aiRole.trim(),
        priority,
    }));

export const canRunProvisioning = (
    settings: AiIdentityProvisioningSettings,
    state: {
        mappingsDirty: boolean;
        hasPlan: boolean;
        fetchingPlan: boolean;
        planError: boolean;
        running: boolean;
    },
) =>
    settings.provisioner?.status === AiIdentityProvisionerStatus.READY &&
    settings.mode === AiIdentityCreationMode.AUTOMATIC &&
    settings.effectiveMode === AiIdentityCreationMode.AUTOMATIC &&
    !state.mappingsDirty &&
    state.hasPlan &&
    !state.fetchingPlan &&
    !state.planError &&
    !state.running;
