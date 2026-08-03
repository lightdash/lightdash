import type { Account } from '@lightdash/common';
import { McpService } from './McpService';

const createService = () =>
    Object.assign(Object.create(McpService.prototype), {
        lightdashConfig: { mcp: { enabled: true } },
    }) as McpService;

const createAccount = ({
    isOauthUser,
    scopes = [],
}: {
    isOauthUser: boolean;
    scopes?: string[];
}) =>
    ({
        authentication: {
            type: isOauthUser ? 'oauth' : 'pat',
            scopes,
        },
        isOauthUser: () => isOauthUser,
    }) as unknown as Account;

describe('McpService MCP scope authorization', () => {
    it.each([
        { scopes: [] },
        { scopes: ['read'] },
        { scopes: ['write'] },
        { scopes: ['read', 'write'] },
    ])('rejects OAuth clients without an MCP scope: %j', ({ scopes }) => {
        const service = createService();

        expect(() =>
            service.canAccessMcp(createAccount({ isOauthUser: true, scopes })),
        ).toThrow('You are not allowed to access MCP');
    });

    it.each([['mcp:read'], ['mcp:write']])(
        'allows OAuth clients with the %s scope',
        (scope) => {
            const service = createService();

            expect(
                service.canAccessMcp(
                    createAccount({ isOauthUser: true, scopes: [scope] }),
                ),
            ).toBe(true);
        },
    );

    it('does not require OAuth scopes for other account types', () => {
        const service = createService();

        expect(
            service.canAccessMcp(createAccount({ isOauthUser: false })),
        ).toBe(true);
    });
});
