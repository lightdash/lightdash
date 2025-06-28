export const ProjectScope = {
    MANAGE: 'project:manage',
} as const;

export const ContentScope = {
    MANAGE: 'content:manage',
} as const;

export const ScimScope = {
    MANAGE: 'scim:manage',
} as const;

// Organization scopes for backwards compatibility
export const OrgScope = {
    READ: 'org:read',
    EDIT: 'org:edit',
    ADMIN: 'org:admin',
} as const;

export const ALL_SCOPES = [
    ...Object.values(ProjectScope),
    ...Object.values(ContentScope),
    ...Object.values(ScimScope),
    ...Object.values(OrgScope),
] as const;

export type ServiceAccountScope = typeof ALL_SCOPES[number];
