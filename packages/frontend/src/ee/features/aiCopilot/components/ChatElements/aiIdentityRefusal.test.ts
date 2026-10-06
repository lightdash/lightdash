import {
    AI_IDENTITY_NOT_READY_CODE,
    AI_IDENTITY_SYNC_UNSAFE_CODE,
    AiIdentityState,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { parseAiIdentityRefusal } from './aiIdentityRefusal';

it.each([
    AiIdentityState.PENDING,
    AiIdentityState.FAILED,
    AiIdentityState.NEEDS_SIGN_IN,
])('recognizes a stored %s refusal', (state) => {
    const refusal = {
        code: AI_IDENTITY_NOT_READY_CODE,
        state,
        message: 'Ask an admin to set up your AI identity.',
    };
    expect(parseAiIdentityRefusal(JSON.stringify(refusal))).toEqual(refusal);
});

it('recognizes a grant sync refusal', () => {
    const refusal = {
        code: AI_IDENTITY_SYNC_UNSAFE_CODE,
        state: AiIdentityState.PENDING,
        message:
            'AI grant sync is not safe or recent. Ask an admin to check it.',
    };
    expect(parseAiIdentityRefusal(JSON.stringify(refusal))).toEqual(refusal);
});

describe('ordinary prompt errors', () => {
    it.each([
        null,
        undefined,
        '',
        'A query failed',
        '{}',
        '{',
        JSON.stringify({ code: 'other', state: 'pending', message: 'error' }),
        JSON.stringify({
            code: AI_IDENTITY_NOT_READY_CODE,
            state: 'ready',
            message: 'error',
        }),
    ])('does not interpret %s as a refusal', (value) => {
        expect(parseAiIdentityRefusal(value)).toBeNull();
    });
});
