import { type TFunction } from 'i18next';

export interface AccessOption {
    title: string;
    description?: string;
    selectDescription: string;
    value: string;
}

export const enum UserAccessAction {
    DELETE = 'delete',
    VIEWER = 'viewer',
    EDITOR = 'editor',
    ADMIN = 'admin',
}

export const getUserAccessOptions = (
    t: TFunction<'modals'>,
): AccessOption[] => [
    {
        title: t('shareSpace.accessOptions.canView'),
        selectDescription: t('shareSpace.accessOptions.canViewDescription'),
        value: UserAccessAction.VIEWER,
    },
    {
        title: t('shareSpace.accessOptions.canEdit'),
        selectDescription: t('shareSpace.accessOptions.canEditDescription'),
        value: UserAccessAction.EDITOR,
    },
    {
        title: t('shareSpace.accessOptions.fullAccess'),
        selectDescription: t('shareSpace.accessOptions.fullAccessDescription'),
        value: UserAccessAction.ADMIN,
    },
    {
        title: t('shareSpace.accessOptions.noAccess'),
        selectDescription: t('shareSpace.accessOptions.noAccessDescription'),
        value: UserAccessAction.DELETE,
    },
];
