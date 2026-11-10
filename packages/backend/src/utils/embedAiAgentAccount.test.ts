import { type Account } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { isAiAgentEmbedAccount } from './embedAiAgentAccount';

const jwtAccount = (type: string) =>
    ({
        isJwtUser: () => true,
        authentication: { type: 'jwt', data: { content: { type } } },
    }) as unknown as Account;

describe('isAiAgentEmbedAccount', () => {
    it('is true for an AI agent embed token', () => {
        expect(isAiAgentEmbedAccount(jwtAccount('aiAgent'))).toBe(true);
    });

    it.each(['dashboard', 'chart', 'metricsCatalog'])(
        'is false for a %s embed token',
        (type) => {
            expect(isAiAgentEmbedAccount(jwtAccount(type))).toBe(false);
        },
    );

    it('is false for a session account', () => {
        expect(
            isAiAgentEmbedAccount({
                isJwtUser: () => false,
                authentication: { type: 'session' },
            } as unknown as Account),
        ).toBe(false);
    });
});
