import { subject } from '@casl/ability';
import useApp from '../../../providers/App/useApp';

export const useRecentlyDeletedAccess = (
    projectUuid: string | undefined,
): boolean => {
    const { health, user } = useApp();
    return (
        !!projectUuid &&
        health.data?.softDelete.enabled === true &&
        (user.data?.ability.can(
            'manage',
            subject('DeletedContent', {
                organizationUuid: user.data.organizationUuid,
                projectUuid,
            }),
        ) ??
            false)
    );
};
