import {
    getOrgAssignableScopes,
    getScopes,
    isOrgAssignableScope,
} from './scopes';

// Deliberate golden copy of the org-assignable set. Do NOT replace this with a
// call to getOrgAssignableScopes() — the point is to fail loudly when a scope's
// `level` is changed to/from 'organization' without a conscious test update.
const ORG_ASSIGNABLE_SCOPE_NAMES = [
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
    it('classifies the org-assignable scope set and treats every other scope as project-level', () => {
        expect(getOrgAssignableScopes()).toEqual(
            expect.arrayContaining(ORG_ASSIGNABLE_SCOPE_NAMES),
        );
        expect(getOrgAssignableScopes()).toHaveLength(
            ORG_ASSIGNABLE_SCOPE_NAMES.length,
        );

        ORG_ASSIGNABLE_SCOPE_NAMES.forEach((scopeName) => {
            expect(isOrgAssignableScope(scopeName)).toBe(true);
        });

        expect(isOrgAssignableScope('delete:Project')).toBe(false);
        expect(isOrgAssignableScope('create:Project@preview')).toBe(false);
        expect(isOrgAssignableScope('manage:SpotlightTableConfig')).toBe(false);
        expect(isOrgAssignableScope('manage:ContentAsCode')).toBe(false);
        expect(isOrgAssignableScope('manage:ExternalConnection')).toBe(false);
        // The project-level AI agent scopes stay project-assignable; only the
        // dedicated OrganizationAiAgent scopes are org-assignable.
        expect(isOrgAssignableScope('view:AiAgent')).toBe(false);
        expect(isOrgAssignableScope('manage:AiAgent')).toBe(false);
    });

    it('keeps every org-assignable scope name backed by a real scope definition', () => {
        const scopeNames = new Set(
            getScopes({ isEnterprise: true }).map((scope) => scope.name),
        );

        getOrgAssignableScopes().forEach((scopeName) => {
            expect(scopeNames.has(scopeName)).toBe(true);
        });
    });
});
