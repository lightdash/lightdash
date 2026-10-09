import { Ability, subject } from '@casl/ability';
import { MemberAbility, PossibleAbilities } from '@lightdash/common';
import Logger from '../../logging/logger';
import {
    createOAuthScopedAbility,
    getOAuthScopeContext,
} from './scopedAbility';

vi.mock('../../logging/logger', () => ({ default: { warn: vi.fn() } }));

const request = {
    method: 'POST',
    routeTemplate: '/projects/:projectUuid/charts',
};
const create = (
    base: MemberAbility,
    mode: 'log' | 'enforce',
    scopes = ['read'],
) =>
    createOAuthScopedAbility(base, {
        mode,
        scopes,
        clientId: 'client',
        getRequest: () => request,
    });

beforeEach(() => vi.clearAllMocks());

describe.each(['log', 'enforce'] as const)(
    'OAuth ability in %s mode',
    (mode) => {
        it('agrees across can, cannot and relevantRuleFor and records once per pair', () => {
            const base = new Ability<PossibleAbilities>([
                { action: 'manage', subject: 'SavedChart' },
            ]);
            const ability = create(base, mode);
            expect(ability.can('create', 'SavedChart')).toBe(mode === 'log');
            expect(ability.cannot('create', 'SavedChart')).toBe(
                mode === 'enforce',
            );
            const rule = ability.relevantRuleFor('create', 'SavedChart');
            expect(Boolean(rule && !rule.inverted)).toBe(mode === 'log');
            expect(Logger.warn).toHaveBeenCalledTimes(1);
            expect(ability.can('view', 'SavedChart')).toBe(true);
            expect(base.can('create', 'SavedChart')).toBe(true);
            expect(base.rules).toEqual([
                { action: 'manage', subject: 'SavedChart' },
            ]);
        });

        it('preserves conditions, fields and inverted rules', () => {
            const base = new Ability<PossibleAbilities>([
                {
                    action: 'manage',
                    subject: 'SavedChart',
                    conditions: { projectUuid: 'allowed' },
                    fields: ['name'],
                },
                {
                    action: 'view',
                    subject: 'SavedChart',
                    conditions: { blocked: true },
                    inverted: true,
                },
            ]);
            const ability = create(base, mode);
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', { projectUuid: 'allowed' }),
                    'name',
                ),
            ).toBe(true);
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', { projectUuid: 'other' }),
                    'name',
                ),
            ).toBe(false);
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', { projectUuid: 'allowed' }),
                    'sql',
                ),
            ).toBe(false);
            const blocked = subject('SavedChart', {
                projectUuid: 'allowed',
                blocked: true,
            });
            expect(ability.cannot('view', blocked, 'name')).toBe(true);
            expect(
                ability.relevantRuleFor('view', blocked, 'name')?.inverted,
            ).toBe(true);
            expect(Logger.warn).not.toHaveBeenCalled();
        });

        it('logs only fixed metadata, never the subject or token data', () => {
            const ability = create(
                new Ability<PossibleAbilities>([
                    { action: 'manage', subject: 'all' },
                ]),
                mode,
            );
            ability.can(
                'create',
                subject('SavedChart', {
                    projectUuid: 'private',
                    sql: 'secret query',
                    name: 'customer',
                }),
            );
            expect(Logger.warn).toHaveBeenCalledExactlyOnceWith(
                'oauth_scope_refusal',
                {
                    mode,
                    clientId: 'client',
                    scopes: ['read'],
                    method: 'POST',
                    routeTemplate: '/projects/:projectUuid/charts',
                    toolName: null,
                    action: 'create',
                    subjectType: 'SavedChart',
                },
            );
        });

        it('deduplicates per request, not across requests', () => {
            const base = new Ability<PossibleAbilities>([
                { action: 'manage', subject: 'all' },
            ]);
            create(base, mode).can('create', 'SavedChart');
            create(base, mode).can('create', 'SavedChart');
            expect(Logger.warn).toHaveBeenCalledTimes(2);
            expect(getOAuthScopeContext(base)).toBeNull();
        });
    },
);

it('expands manage/all without leaving wildcard grants, including read-like manage', () => {
    const ability = create(
        new Ability<PossibleAbilities>([{ action: 'manage', subject: 'all' }]),
        'enforce',
    );
    expect(ability.can('manage', 'SqlRunner')).toBe(true);
    expect(ability.can('delete', 'SqlRunner')).toBe(false);
    expect(ability.can('view', 'Project')).toBe(true);
    expect(ability.can('manage', 'Organization')).toBe(false);
    expect(ability.can('view', 'FutureSubject' as 'Project')).toBe(false);
    expect(ability.can('futureAction' as 'view', 'Project')).toBe(false);
    expect(ability.rules.every((rule) => rule.subject !== 'all')).toBe(true);
});

it('preserves inverted manage rules and rule order when expanding wildcards', () => {
    const ability = create(
        new Ability<PossibleAbilities>([
            { action: 'manage', subject: 'all' },
            {
                action: 'manage',
                subject: 'Project',
                inverted: true,
                conditions: { projectUuid: 'blocked' },
            },
            {
                action: 'view',
                subject: 'Project',
                conditions: { projectUuid: 'exception' },
            },
        ]),
        'enforce',
    );
    expect(
        ability.can('view', subject('Project', { projectUuid: 'blocked' })),
    ).toBe(false);
    expect(
        ability.can('view', subject('Project', { projectUuid: 'exception' })),
    ).toBe(true);
});
