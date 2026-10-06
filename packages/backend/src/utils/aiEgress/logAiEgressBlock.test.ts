import { AiEgressBlockReason, AiEgressSurface } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import Logger from '../../logging/logger';
import { logAiEgressBlock } from './logAiEgressBlock';

describe('logAiEgressBlock', () => {
    it('logs the surface and the typed reason', () => {
        const info = vi.spyOn(Logger, 'info').mockReturnValue(Logger);
        logAiEgressBlock({
            surface: AiEgressSurface.AGENT_THREAD_HISTORY,
            reason: AiEgressBlockReason.ROWS_NOT_FETCHED_BY_AI_SIGN_IN,
            organizationUuid: 'org',
            projectUuid: 'project',
            userUuid: 'user',
            detail: null,
        });
        expect(info).toHaveBeenCalledWith(
            'AI egress blocked under AI access restrictions',
            expect.objectContaining({
                aiEgressSurface: 'agent_thread_history',
                aiEgressReason: 'rows_not_fetched_by_ai_sign_in',
                projectUuid: 'project',
            }),
        );
    });
});
