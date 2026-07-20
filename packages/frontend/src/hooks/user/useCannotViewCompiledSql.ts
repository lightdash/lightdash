import { subject } from '@casl/ability';
import useApp from '../../providers/App/useApp';

export const useCannotViewCompiledSql = (projectUuid: string | undefined) => {
    const { user } = useApp();

    return user.data?.ability.cannot(
        'view',
        subject('CompiledSql', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
};
