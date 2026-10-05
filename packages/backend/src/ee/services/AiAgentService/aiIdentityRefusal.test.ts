import {
    AI_IDENTITY_NOT_READY_CODE,
    AiIdentityState,
    type AiAccessForUser,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getAiIdentityRefusal } from './aiIdentityRefusal';

const access: AiAccessForUser = {
    projectUuid: 'project',
    restrictionsOn: true,
    warehouseType: 'snowflake',
    aiIdentityRequired: true,
    state: AiIdentityState.PENDING,
    aiIdentityName: null,
    lastCheckedAt: null,
    action: 'ask_admin',
    message: null,
    rawSqlAllowed: false,
};

describe('AI identity prompt refusal', () => {
    it.each([
        AiIdentityState.PENDING,
        AiIdentityState.FAILED,
        AiIdentityState.NEEDS_SIGN_IN,
        null,
    ])('refuses %s', (state) => {
        expect(getAiIdentityRefusal({ ...access, state })).toEqual({
            code: AI_IDENTITY_NOT_READY_CODE,
            state: state ?? AiIdentityState.PENDING,
            message: expect.any(String),
        });
    });
    it('allows a ready identity', () => {
        expect(
            getAiIdentityRefusal({ ...access, state: AiIdentityState.READY }),
        ).toBeNull();
    });
    it('allows projects that do not require an identity', () => {
        expect(
            getAiIdentityRefusal({ ...access, aiIdentityRequired: false }),
        ).toBeNull();
    });
});
