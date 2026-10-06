import {
    AI_IDENTITY_NOT_READY_CODE,
    AI_IDENTITY_SYNC_UNSAFE_CODE,
    AI_IDENTITY_SYNC_UNSAFE_MESSAGE,
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
    automaticSyncRefusal: false,
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
    it('refuses a ready identity when automatic grants are unsafe', () => {
        expect(
            getAiIdentityRefusal({
                ...access,
                state: AiIdentityState.READY,
                automaticSyncRefusal: true,
            }),
        ).toEqual({
            code: AI_IDENTITY_SYNC_UNSAFE_CODE,
            state: AiIdentityState.PENDING,
            message: AI_IDENTITY_SYNC_UNSAFE_MESSAGE,
        });
    });
    it('allows projects that do not require an identity', () => {
        expect(
            getAiIdentityRefusal({ ...access, aiIdentityRequired: false }),
        ).toBeNull();
    });
});
