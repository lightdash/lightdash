import { ForbiddenError } from '@lightdash/common';
import Logger from '../../logging/logger';
import { UserService } from '../../services/UserService';
import { fromOauth, fromSession, toSessionUser } from '../account/account';
import { defaultSessionUser } from '../account/account.mock';
import {
    assertOAuthScopeOperation,
    OAUTH_UNCHECKED_OPERATIONS,
    requireOAuthScopeOperation,
} from './unchecked';

const actor = (mode: 'log' | 'enforce' | null, scopes: string[]) =>
    fromOauth(
        defaultSessionUser,
        { accessToken: 'secret', client: { id: 'client' }, scope: scopes },
        mode === null
            ? null
            : {
                  mode,
                  getRequest: () => ({
                      method: 'POST',
                      routeTemplate: '/operation',
                  }),
              },
    );
beforeEach(() => {
    vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
});
afterEach(() => vi.restoreAllMocks());

describe.each(
    Object.keys(
        OAUTH_UNCHECKED_OPERATIONS,
    ) as (keyof typeof OAUTH_UNCHECKED_OPERATIONS)[],
)('%s', (operation) => {
    it.each(['log', 'enforce'] as const)(
        'applies %s policy to accounts and converted session users',
        (mode) => {
            for (const scopes of [
                [],
                ['read'],
                ['mcp:read'],
                ['write'],
                ['mcp:write'],
            ]) {
                const account = actor(mode, scopes);
                const allowed =
                    scopes.includes('write') ||
                    scopes.includes('mcp:write') ||
                    (OAUTH_UNCHECKED_OPERATIONS[operation] === 'read' &&
                        scopes.length > 0);
                const run = () => assertOAuthScopeOperation(account, operation);
                const converted = () =>
                    assertOAuthScopeOperation(
                        toSessionUser(account),
                        operation,
                    );
                if (allowed || mode === 'log') {
                    expect(run).not.toThrow();
                    expect(converted).not.toThrow();
                } else {
                    expect(run).toThrow(ForbiddenError);
                    expect(converted).toThrow(ForbiddenError);
                }
                expect(Logger.warn).toHaveBeenCalledTimes(allowed ? 0 : 1);
                vi.mocked(Logger.warn).mockClear();
            }
        },
    );
    it('preserves flag-off and session requests', () => {
        assertOAuthScopeOperation(actor(null, []), operation);
        assertOAuthScopeOperation(fromSession(defaultSessionUser), operation);
        expect(Logger.warn).not.toHaveBeenCalled();
    });
    it('stops the route before its handler', () => {
        const next = vi.fn();
        requireOAuthScopeOperation(operation)(
            { account: actor('enforce', []) } as never,
            {} as never,
            next,
        );
        expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
});

it('guards email verification before looking up or consuming the code', async () => {
    const lookup = vi.fn();
    const service = new UserService({
        emailModel: { getPrimaryEmailStatusByUserAndOtp: lookup },
    } as unknown as ConstructorParameters<typeof UserService>[0]);
    await expect(
        service.getPrimaryEmailStatus(
            toSessionUser(actor('enforce', ['read'])),
            '123456',
        ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(lookup).not.toHaveBeenCalled();
});

it('preserves anonymous access on routes with optional authentication', () => {
    const next = vi.fn();
    requireOAuthScopeOperation('FeatureFlagController.getFeatureFlag')(
        {} as never,
        {} as never,
        next,
    );
    expect(next).toHaveBeenCalledExactlyOnceWith();
    expect(Logger.warn).not.toHaveBeenCalled();
});

it.each(['read', 'mcp:read'])(
    'keeps completed query downloads available with %s',
    (scope) => {
        expect(() =>
            assertOAuthScopeOperation(
                actor('enforce', [scope]),
                'QueryController.downloadResults',
            ),
        ).not.toThrow();
    },
);
