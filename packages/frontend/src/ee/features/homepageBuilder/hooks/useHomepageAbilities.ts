import { subject } from '@casl/ability';
import useApp from '../../../../providers/App/useApp';

const useCanManage = (
    subjectType: 'Project' | 'ProjectHomepage',
    projectUuid: string | undefined,
): boolean => {
    const { user } = useApp();
    return (
        user.data?.ability?.can(
            'manage',
            subject(subjectType, {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        ) ?? false
    );
};

export const useCanManageProject = (
    projectUuid: string | null | undefined,
): boolean => useCanManage('Project', projectUuid ?? undefined);

export const useCanManageHomepage = (
    projectUuid: string | undefined,
): boolean => useCanManage('ProjectHomepage', projectUuid);
