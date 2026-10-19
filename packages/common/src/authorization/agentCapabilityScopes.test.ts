import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { ServiceAccountScope } from '../ee/serviceAccounts/types';
import { AgentCapability } from '../types/agentPermissions';
import { OrganizationMemberRole } from '../types/organizationMemberProfile';
import { ProjectMemberRole } from '../types/projectMemberRole';
import { ScopeGroup } from '../types/scopes';
import {
    AGENT_CAPABILITY_SCOPES,
    AGENT_SCOPE_CAPABILITIES,
} from './agentCapabilityScopes';
import { applyOrganizationMemberStaticAbilities } from './organizationMemberAbility';
import { projectMemberAbilities } from './projectMemberAbility';
import { getAllScopesForRole } from './roleToScopeMapping';
import { buildAbilityFromScopes } from './scopeAbilityBuilder';
import { getScopes } from './scopes';
import { applyServiceAccountAbilities } from './serviceAccountAbility';
import { type CaslSubjectNames, type MemberAbility } from './types';

const expectedDefaultScopes = [
    'view:AgentReadDiscover',
    'view:AgentQuery',
    'view:AgentExport',
    'view:AgentRawSql',
];

const expectedMappings = [
    [AgentCapability.ReadDiscover, 'view:AgentReadDiscover'],
    [AgentCapability.Query, 'view:AgentQuery'],
    [AgentCapability.RawSql, 'view:AgentRawSql'],
    [AgentCapability.ContentWrite, 'view:AgentContentWrite'],
    [AgentCapability.Delete, 'view:AgentDelete'],
    [AgentCapability.Publish, 'view:AgentPublish'],
    [AgentCapability.DeployUpload, 'view:AgentDeployUpload'],
    [AgentCapability.DbtWriteback, 'view:AgentDbtWriteback'],
    [AgentCapability.Export, 'view:AgentExport'],
    [AgentCapability.Administration, 'view:AgentAdministration'],
    [AgentCapability.ExternalTools, 'view:AgentExternalTools'],
] as const;

describe('agent capability scopes', () => {
    it('maps every capability to a distinct scope and back', () => {
        expect(Object.keys(AGENT_CAPABILITY_SCOPES)).toHaveLength(11);
        expect(Object.keys(AGENT_SCOPE_CAPABILITIES)).toHaveLength(11);
        expectedMappings.forEach(([capability, scope]) => {
            expect(AGENT_CAPABILITY_SCOPES[capability]).toBe(scope);
            expect(AGENT_SCOPE_CAPABILITIES[scope]).toBe(capability);
        });
    });

    it.each(expectedMappings)(
        'registers %s as an enterprise AI scope',
        (_, scopeName) => {
            expect(getScopes({ isEnterprise: true })).toContainEqual(
                expect.objectContaining({
                    name: scopeName,
                    group: ScopeGroup.AI,
                    isEnterprise: true,
                }),
            );
            expect(
                getScopes({ isEnterprise: false }).map((scope) => scope.name),
            ).not.toContain(scopeName);
        },
    );

    it.each(expectedMappings)(
        'grants only the capability subject for %s',
        (_, scopeName) => {
            const builder = new AbilityBuilder<MemberAbility>(Ability);
            expect(
                buildAbilityFromScopes(
                    {
                        userUuid: 'user',
                        projectUuid: 'project',
                        scopes: [scopeName],
                        isEnterprise: true,
                    },
                    builder,
                ),
            ).toEqual([]);
            const ability = builder.build();
            const resource = scopeName.split(':')[1] as CaslSubjectNames;
            expect(ability.rules).toEqual([
                {
                    action: 'view',
                    subject: resource,
                    conditions: { projectUuid: 'project' },
                },
            ]);
            expect(
                ability.can(
                    'view',
                    subject(resource, { projectUuid: 'project' }),
                ),
            ).toBe(true);
            expect(
                ability.can(
                    'view',
                    subject(resource, { projectUuid: 'other' }),
                ),
            ).toBe(false);
            expect(
                ability.can(
                    'manage',
                    subject('SqlRunner', { projectUuid: 'project' }),
                ),
            ).toBe(false);
            expect(
                ability.can(
                    'manage',
                    subject('Organization', { organizationUuid: 'org' }),
                ),
            ).toBe(false);
        },
    );

    it.each(Object.values(ProjectMemberRole))(
        'gives the %s preset exactly the four defaults',
        (role) => {
            const actual = getAllScopesForRole(role).filter((scope) =>
                scope.startsWith('view:Agent'),
            );
            expect(new Set(actual)).toEqual(new Set(expectedDefaultScopes));
            const builder = new AbilityBuilder<MemberAbility>(Ability);
            projectMemberAbilities[role](
                { role, userUuid: 'user', projectUuid: 'project' },
                builder,
            );
            const granted = builder.rules
                .filter(
                    (rule) =>
                        typeof rule.subject === 'string' &&
                        rule.subject.startsWith('Agent'),
                )
                .map((rule) => `${rule.action}:${rule.subject}`);
            expect(new Set(granted)).toEqual(new Set(expectedDefaultScopes));
        },
    );

    it.each(Object.values(OrganizationMemberRole))(
        'scopes the %s organization defaults to its organization',
        (role) => {
            const builder = new AbilityBuilder<MemberAbility>(Ability);
            applyOrganizationMemberStaticAbilities[role](
                { userUuid: 'user', organizationUuid: 'org' },
                builder,
            );
            const grants = builder.rules.filter(
                (rule) =>
                    typeof rule.subject === 'string' &&
                    rule.subject.startsWith('Agent'),
            );
            expect(
                new Set(grants.map((rule) => `${rule.action}:${rule.subject}`)),
            ).toEqual(
                new Set(
                    role === OrganizationMemberRole.MEMBER
                        ? []
                        : expectedDefaultScopes,
                ),
            );
            grants.forEach((rule) =>
                expect(rule.conditions).toEqual({ organizationUuid: 'org' }),
            );
        },
    );

    it.each([
        ServiceAccountScope.ORG_READ,
        ServiceAccountScope.ORG_EDIT,
        ServiceAccountScope.ORG_ADMIN,
    ])('carries defaults through the %s service account scope', (scope) => {
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        applyServiceAccountAbilities({
            organizationUuid: 'org',
            userUuid: 'service-account',
            scopes: [scope],
            builder,
        });
        const ability = builder.build();
        expectedDefaultScopes.forEach((scopeName) => {
            const resource = scopeName.split(':')[1] as CaslSubjectNames;
            expect(
                ability.can(
                    'view',
                    subject(resource, { organizationUuid: 'org' }),
                ),
            ).toBe(true);
            expect(
                ability.can(
                    'view',
                    subject(resource, { organizationUuid: 'other' }),
                ),
            ).toBe(false);
        });
        expect(
            ability.can(
                'view',
                subject('AgentAdministration', { organizationUuid: 'org' }),
            ),
        ).toBe(false);
    });
});
