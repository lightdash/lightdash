import {
    getOrganizationOnlyScopes,
    getScopes,
    isOrganizationOnlyScope,
    isScopeAssignableAtLevel,
} from './scopes';

// Deliberate golden copy of the org-only set. Do NOT replace this with
// getOrganizationOnlyScopes(); the point is to fail loudly when a scope's
// `level` changes to/from 'organization' without a conscious test update.
const ORG_ONLY_SCOPE_NAMES = [
    'view:Organization',
    'manage:Organization',
    'view:OrganizationMemberProfile',
    'manage:OrganizationMemberProfile',
    'manage:InviteLink',
    'manage:Group',
    'manage:GitIntegration',
    'view:OrganizationWarehouseCredentials',
    'manage:OrganizationWarehouseCredentials',
    'manage:PersonalAccessToken',
    'impersonate:User',
    'view:OrganizationDesign',
    'manage:OrganizationDesign',
    'view:OrganizationAiAgent',
    'manage:OrganizationAiAgent',
];

describe('scope levels', () => {
    it('classifies the org-only scope set and treats every other scope as project-level', () => {
        expect(getOrganizationOnlyScopes()).toEqual(
            expect.arrayContaining(ORG_ONLY_SCOPE_NAMES),
        );
        expect(getOrganizationOnlyScopes()).toHaveLength(
            ORG_ONLY_SCOPE_NAMES.length,
        );

        ORG_ONLY_SCOPE_NAMES.forEach((scopeName) => {
            expect(isOrganizationOnlyScope(scopeName)).toBe(true);
        });

        expect(isOrganizationOnlyScope('delete:Project')).toBe(false);
        expect(isOrganizationOnlyScope('create:Project@preview')).toBe(false);
        expect(isOrganizationOnlyScope('manage:SpotlightTableConfig')).toBe(
            false,
        );
        expect(isOrganizationOnlyScope('manage:ContentAsCode')).toBe(false);
        expect(isOrganizationOnlyScope('manage:ExternalConnection')).toBe(
            false,
        );
        // The project-level AI agent scopes stay project-assignable; only the
        // dedicated OrganizationAiAgent scopes are org-assignable.
        expect(isOrganizationOnlyScope('view:AiAgent')).toBe(false);
        expect(isOrganizationOnlyScope('manage:AiAgent')).toBe(false);
    });

    it('keeps every organization-only scope name backed by a real scope definition', () => {
        const scopeNames = new Set(
            getScopes({ isEnterprise: true }).map((scope) => scope.name),
        );

        getOrganizationOnlyScopes().forEach((scopeName) => {
            expect(scopeNames.has(scopeName)).toBe(true);
        });
    });

    it('allows organization roles to include project scopes while keeping organization scopes out of project roles', () => {
        expect(
            isScopeAssignableAtLevel('view:Organization', 'organization'),
        ).toBe(true);
        expect(isScopeAssignableAtLevel('view:Dashboard', 'organization')).toBe(
            true,
        );
        expect(isScopeAssignableAtLevel('view:Dashboard', 'project')).toBe(
            true,
        );
        expect(isScopeAssignableAtLevel('view:Organization', 'project')).toBe(
            false,
        );
    });
});
