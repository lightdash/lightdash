export interface AccessOption {
    title: string;
    description?: string;
    selectDescription: string;
    value: string;
}

export const enum SpacePrivateAccessType {
    PRIVATE = 'private',
    SHARED = 'shared',
}

export const enum SpaceAccessType {
    PRIVATE = 'private',
    PUBLIC = 'public',
}

export const SpaceAccessOptions: AccessOption[] = [
    {
        title: 'Restricted access',
        description: 'Only invited members and admins can access',
        selectDescription: 'Only invited members and admins can access',
        value: SpaceAccessType.PRIVATE,
    },
    {
        title: 'Public access',
        description: 'All project members can access',
        selectDescription:
            'All project members can access with their project permissions',
        value: SpaceAccessType.PUBLIC,
    },
];

export const enum UserAccessAction {
    DELETE = 'delete',
    VIEWER = 'viewer',
    EDITOR = 'editor',
    ADMIN = 'admin',
}

export const UserAccessOptions: AccessOption[] = [
    {
        title: 'Can view',
        selectDescription: `View space contents.`,
        value: UserAccessAction.VIEWER,
    },
    {
        title: 'Can edit',
        selectDescription: `Edit space contents.`,
        value: UserAccessAction.EDITOR,
    },
    {
        title: 'Full access',
        selectDescription: `Manage space access and content.`,
        value: UserAccessAction.ADMIN,
    },
    {
        title: 'No access',
        selectDescription: `Remove user's access`,
        value: UserAccessAction.DELETE,
    },
];
