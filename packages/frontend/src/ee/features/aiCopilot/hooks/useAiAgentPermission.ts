import { subject } from '@casl/ability';
import useApp from '../../../../providers/App/useApp';

export const useAiAgentPermission = ({
    action,
    projectUuid,
}: {
    action: 'manage' | 'view';
    projectUuid?: string;
}) => {
    const { user } = useApp();
    return user.data?.ability.can(
        action,
        subject('AiAgent', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
};

export const useCanCreateAiAgentThread = (projectUuid?: string) => {
    const { user } = useApp();
    return !!user.data?.ability.can(
        'create',
        subject('AiAgentThread', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
};

export const useCanManageAiAgentThread = ({
    projectUuid,
    threadUserUuid,
}: {
    projectUuid?: string;
    threadUserUuid?: string;
}) => {
    const { user } = useApp();
    return !!user.data?.ability.can(
        'manage',
        subject('AiAgentThread', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
            userUuid: threadUserUuid,
        }),
    );
};

export const useAiAgentOrgPermission = ({
    action,
}: {
    action: 'manage' | 'view';
}) => {
    const { user } = useApp();
    return user.data?.ability.can(
        action,
        subject('OrganizationAiAgent', {
            organizationUuid: user.data?.organizationUuid,
        }),
    );
};
