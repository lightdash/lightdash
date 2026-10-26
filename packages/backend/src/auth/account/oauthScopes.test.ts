import { Ability } from '@casl/ability';
import { PossibleAbilities } from '@lightdash/common';
import Logger from '../../logging/logger';
import {
    fromApiKey,
    fromOauth,
    fromServiceAccount,
    fromSession,
} from './account';
import { defaultSessionUser } from './account.mock';

vi.mock('../../logging/logger', () => ({ default: { warn: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe('OAuth account scopes', () => {
    const policy = {
        getRequest: () => ({ method: 'POST', routeTemplate: '/charts' }),
    };

    it('restricts only the request account and leaves the source user unchanged', () => {
        const ability = new Ability<PossibleAbilities>([
            { action: 'manage', subject: 'SavedChart' },
        ]);
        const user = {
            ...defaultSessionUser,
            ability,
            abilityRules: ability.rules,
        };
        const account = fromOauth(
            user,
            {
                accessToken: 'secret',
                client: { id: 'client' },
                scope: ['mcp:read'],
            },
            policy,
        );
        expect(account.user.ability.can('create', 'SavedChart')).toBe(false);
        expect(account.user.ability.can('view', 'SavedChart')).toBe(true);
        expect(user.ability.can('create', 'SavedChart')).toBe(true);
        expect(Logger.warn).toHaveBeenCalledTimes(1);
        expect(account.user.abilityRules).toBe(account.user.ability.rules);
        expect(account.user.ability).not.toBe(user.ability);
    });

    it.each([
        { scopes: [], canRead: false, canWrite: false },
        { scopes: ['read'], canRead: true, canWrite: false },
        { scopes: ['write'], canRead: true, canWrite: true },
    ])(
        'enforces the default policy with scopes $scopes',
        ({ scopes, canRead, canWrite }) => {
            const ability = new Ability<PossibleAbilities>([
                { action: 'manage', subject: 'all' },
            ]);
            const user = {
                ...defaultSessionUser,
                ability,
                abilityRules: ability.rules,
            };
            const account = fromOauth(user, {
                accessToken: 'secret',
                client: { id: 'client' },
                scope: scopes,
            });
            expect(account.user.ability.can('view', 'Project')).toBe(canRead);
            expect(account.user.ability.can('create', 'SavedChart')).toBe(
                canWrite,
            );
            expect(account.user.abilityRules).toBe(account.user.ability.rules);
            expect(account.user.ability).not.toBe(ability);
            expect(ability.can('create', 'SavedChart')).toBe(true);
        },
    );

    it.each(['pat', 'session', 'service-account'] as const)(
        'does not change %s accounts',
        (type) => {
            const user = {
                ...defaultSessionUser,
                serviceAccount: { uuid: 'service', description: 'service' },
            };
            const factories = {
                pat: fromApiKey,
                session: fromSession,
                'service-account': fromServiceAccount,
            };
            const account = factories[type](user, 'source');
            expect(account.user.ability).toBe(user.ability);
            expect(account.user.abilityRules).toBe(user.abilityRules);
            expect(Logger.warn).not.toHaveBeenCalled();
        },
    );
});
