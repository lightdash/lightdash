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
        title: 'Full access',
        description: 'All project members can access',
        selectDescription:
            'All project members can access with their project permissions',
        value: SpaceAccessType.PUBLIC,
    },
];
