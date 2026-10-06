import { type AiEgressBlock } from '@lightdash/common';
import Logger from '../../logging/logger';

export const logAiEgressBlock = (block: AiEgressBlock): void => {
    Logger.info('AI egress blocked under AI access restrictions', {
        aiEgressSurface: block.surface,
        aiEgressReason: block.reason,
        organizationUuid: block.organizationUuid,
        projectUuid: block.projectUuid,
        userUuid: block.userUuid,
        detail: block.detail,
    });
};
