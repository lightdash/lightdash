import { subject } from '@casl/ability';
import useApp from '../../providers/App/useApp';

export const useCannotAuthorCustomSql = (projectUuid: string | undefined) => {
    const { user } = useApp();

    return user.data?.ability.cannot(
        'manage',
        subject('CustomFields', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
};
