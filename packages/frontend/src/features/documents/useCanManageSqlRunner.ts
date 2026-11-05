import { subject } from '@casl/ability';
import useApp from '../../providers/App/useApp';

/** Whether the user may write SQL in this project, which adding or changing a SQL chart needs. */
export const useCanManageSqlRunner = (
    organizationUuid: string | undefined,
    projectUuid: string,
): boolean => {
    const { user } = useApp();
    return (
        user.data?.ability?.can(
            'manage',
            subject('SqlRunner', {
                organizationUuid:
                    organizationUuid ?? user.data.organizationUuid,
                projectUuid,
            }),
        ) ?? false
    );
};
