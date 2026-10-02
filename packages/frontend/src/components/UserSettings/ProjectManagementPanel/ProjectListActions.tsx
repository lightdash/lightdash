import { subject } from '@casl/ability';
import { type OrganizationProject } from '@lightdash/common';
import { Button, Group } from '@mantine/core';
import { type FC } from 'react';
import { Link, useNavigate } from 'react-router';
import useToaster from '../../../hooks/toaster/useToaster';
import { useEnsurePlaygroundProject } from '../../../hooks/useEnsurePlaygroundProject';
import { usePlaygroundAvailability } from '../../../hooks/usePlaygroundAvailability';
import useApp from '../../../providers/App/useApp';
import { isPlaygroundProvisioningSource } from '../../../utils/playgroundProject';
import {
    getPlaygroundSetupFailure,
    SAMPLE_DATA_FAILURE_MESSAGES,
} from '../../ProjectConnection/ProjectConnectFlow/playgroundSetupFailure';

const AddSampleDataButton: FC = () => {
    const navigate = useNavigate();
    const { showToastError } = useToaster();
    const ensurePlayground = useEnsurePlaygroundProject();

    const addSampleData = async () => {
        try {
            const { projectUuid } = await ensurePlayground.mutateAsync({
                trigger: 'project_list',
            });
            void navigate(`/projects/${projectUuid}/home`);
        } catch (error) {
            showToastError({
                title: SAMPLE_DATA_FAILURE_MESSAGES[
                    getPlaygroundSetupFailure(error)
                ],
            });
        }
    };

    return (
        <Button
            size="xs"
            variant="default"
            loading={ensurePlayground.isLoading}
            onClick={() => void addSampleData()}
        >
            Add sample data project
        </Button>
    );
};

export const ProjectListActions: FC<{ projects: OrganizationProject[] }> = ({
    projects,
}) => {
    const { user } = useApp();
    const { isConnectJourney, isAvailable } = usePlaygroundAvailability();
    const canCreateProject =
        user.data?.ability.can(
            'create',
            subject('Project', {
                organizationUuid: user.data?.organizationUuid,
            }),
        ) === true;
    if (!canCreateProject) return null;

    const hasPlayground = projects.some((project) =>
        isPlaygroundProvisioningSource(project.provisioningSource),
    );

    return (
        <Group gap="xs">
            {isConnectJourney && isAvailable && !hasPlayground && (
                <AddSampleDataButton />
            )}
            <Button size="xs" component={Link} to="/createProject">
                Create project
            </Button>
        </Group>
    );
};
