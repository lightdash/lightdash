import { subject } from '@casl/ability';
import useApp from '../../providers/App/useApp';

export const useCannotAuthorCustomSqlTableCalculations = (
    projectUuid: string | undefined,
) => {
    const { user } = useApp();

    return user.data?.ability.cannot(
        'manage',
        subject('CustomSqlTableCalculations', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
};
