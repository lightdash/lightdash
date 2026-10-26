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

const actor = (scopes: string[]) =>
    fromOauth(defaultSessionUser, {
        accessToken: 'secret',
        client: { id: 'client' },
        scope: scopes,
    });
beforeEach(() => {
    vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
});
afterEach(() => vi.restoreAllMocks());

describe.each(
    Object.keys(
        OAUTH_UNCHECKED_OPERATIONS,
    ) as (keyof typeof OAUTH_UNCHECKED_OPERATIONS)[],
)('%s', (operation) => {
    it('enforces scopes for accounts and converted session users', () => {
        for (const scopes of [
            [],
            ['read'],
            ['mcp:read'],
            ['write'],
            ['mcp:write'],
        ]) {
            const account = actor(scopes);
            const allowed =
                scopes.includes('write') ||
                scopes.includes('mcp:write') ||
                (OAUTH_UNCHECKED_OPERATIONS[operation] === 'read' &&
                    scopes.length > 0);
            const run = () => assertOAuthScopeOperation(account, operation);
            const converted = () =>
                assertOAuthScopeOperation(toSessionUser(account), operation);
            if (allowed) {
                expect(run).not.toThrow();
                expect(converted).not.toThrow();
            } else {
                expect(run).toThrow(ForbiddenError);
                expect(converted).toThrow(ForbiddenError);
            }
            expect(Logger.warn).toHaveBeenCalledTimes(allowed ? 0 : 1);
            vi.mocked(Logger.warn).mockClear();
        }
    });
    it('preserves session requests', () => {
        assertOAuthScopeOperation(fromSession(defaultSessionUser), operation);
        expect(Logger.warn).not.toHaveBeenCalled();
    });
    it('stops the route before its handler', () => {
        const next = vi.fn();
        requireOAuthScopeOperation(operation)(
            { account: actor([]) } as never,
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
        service.getPrimaryEmailStatus(toSessionUser(actor(['read'])), '123456'),
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
                actor([scope]),
                'QueryController.downloadResults',
            ),
        ).not.toThrow();
    },
);

it('fails closed for an OAuth account without a scope context', () => {
    const account = actor(['write']);
    account.user.ability = defaultSessionUser.ability;
    expect(() =>
        assertOAuthScopeOperation(account, 'DocumentController.updateContent'),
    ).toThrow(ForbiddenError);
});

it('keeps the scope context when an OAuth session user is wrapped as an account', () => {
    const account = fromSession(toSessionUser(actor(['read'])));
    expect(() =>
        assertOAuthScopeOperation(account, 'DocumentController.updateContent'),
    ).toThrow(ForbiddenError);
});
