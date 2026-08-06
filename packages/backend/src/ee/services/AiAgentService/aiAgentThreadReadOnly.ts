import {
    type AiAgentStorageVersion,
    type AiAgentThreadCapability,
    type AiThreadCreatedFrom,
} from '@lightdash/common';

export const getAiAgentThreadReadOnly = ({
    storageVersion,
    createdFrom,
    ownerUserUuid,
    viewerUserUuid,
}: {
    storageVersion: AiAgentStorageVersion;
    createdFrom: AiThreadCreatedFrom;
    ownerUserUuid: string | null;
    viewerUserUuid: string;
}): AiAgentThreadCapability => {
    if (storageVersion === 1) {
        return { readOnly: true, readOnlyReason: 'legacy' };
    }
    if (createdFrom === 'slack') {
        return { readOnly: true, readOnlyReason: 'slack' };
    }
    if (ownerUserUuid !== viewerUserUuid) {
        return { readOnly: true, readOnlyReason: 'not_owner' };
    }
    return { readOnly: false, readOnlyReason: null };
};
