/**
 * The scope registry seam. In-app the host adapts @lightdash/common's
 * getAllScopeMap/getAllScopesForRole; learn.lightdash.com adapts its bundled
 * scope-manifest.json. Const objects rather than enums: the board uses these
 * as values (ScopeGroup.CONTENT) and as types, without TS enum emit.
 */
export const ScopeGroup = {
    CONTENT: 'content',
    PROJECT_MANAGEMENT: 'project_management',
    ORGANIZATION_MANAGEMENT: 'organization_management',
    DATA: 'data',
    SHARING: 'sharing',
    AI: 'ai',
    SPOTLIGHT: 'spotlight',
} as const;
export type ScopeGroup = (typeof ScopeGroup)[keyof typeof ScopeGroup];

export const ProjectMemberRole = {
    VIEWER: 'viewer',
    INTERACTIVE_VIEWER: 'interactive_viewer',
    EDITOR: 'editor',
    DEVELOPER: 'developer',
    ADMIN: 'admin',
} as const;
export type ProjectMemberRole =
    (typeof ProjectMemberRole)[keyof typeof ProjectMemberRole];

export const OrganizationMemberRole = {
    MEMBER: 'member',
    VIEWER: 'viewer',
    INTERACTIVE_VIEWER: 'interactive_viewer',
    EDITOR: 'editor',
    DEVELOPER: 'developer',
    ADMIN: 'admin',
} as const;
export type OrganizationMemberRole =
    (typeof OrganizationMemberRole)[keyof typeof OrganizationMemberRole];

/** The two registry fields the board reads, plus the name it keys on. */
export type Scope = {
    name: string;
    group: ScopeGroup;
    description: string;
};

export interface ScopeSource {
    getAllScopeMap(opts: { isEnterprise: boolean }): Record<string, Scope>;
    getAllScopesForRole(role: ProjectMemberRole): string[];
}
