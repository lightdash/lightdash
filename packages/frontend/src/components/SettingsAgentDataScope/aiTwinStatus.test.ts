import { AiIdentityStatus, type AiIdentity } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    aiIdentityStatusColor,
    aiTwinCheckStatus,
    aiTwinFixStep,
} from './aiTwinStatus';
const identity = (status: AiIdentityStatus): AiIdentity => ({
    aiIdentityUuid: 'identity',
    userUuid: 'user',
    email: 'person@example.com',
    firstName: 'Test',
    lastName: 'Person',
    snowflakeLogin: 'PERSON',
    twinNameOverride: null,
    twinName: 'PERSON_AI',
    publicKey: 'public',
    publicKeyFingerprint: 'SHA256:fingerprint',
    status,
    statusMessage: null,
    checkedAt: null,
});
describe('AI user statuses', () => {
    it.each([
        [AiIdentityStatus.PENDING, 'yellow'],
        [AiIdentityStatus.READY, 'green'],
        [AiIdentityStatus.FAILED, 'red'],
    ])('maps %s to %s', (status, color) => {
        expect(aiIdentityStatusColor(status as AiIdentityStatus)).toBe(color);
    });
    it('requires every member to have a ready identity', () => {
        expect(aiTwinCheckStatus([], 0)).toBe('to do');
        expect(aiTwinCheckStatus([identity(AiIdentityStatus.READY)], 1)).toBe(
            'to do',
        );
        expect(aiTwinCheckStatus([identity(AiIdentityStatus.PENDING)], 0)).toBe(
            'to do',
        );
        expect(aiTwinCheckStatus([identity(AiIdentityStatus.READY)], 0)).toBe(
            'done',
        );
        expect(
            aiTwinCheckStatus(
                [
                    identity(AiIdentityStatus.READY),
                    identity(AiIdentityStatus.FAILED),
                ],
                0,
            ),
        ).toBe('failed');
    });
    it('links checks to the AI user guide steps', () => {
        expect(aiTwinFixStep('masked_column')).toBe(3);
        expect(aiTwinFixStep('agent_active')).toBe(5);
        expect(aiTwinFixStep('result_scan_blocked')).toBe(4);
        expect(aiTwinFixStep('secondary_roles_blocked')).toBe(4);
    });
});
