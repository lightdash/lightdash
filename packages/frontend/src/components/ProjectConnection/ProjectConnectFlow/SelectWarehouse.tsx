import { subject } from '@casl/ability';
import { ProjectType } from '@lightdash/common';
import { Alert, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import { ProjectCreationCard } from '../../common/Settings/SettingsCard';
import InviteExpertFooter from './InviteExpertFooter';
import OnboardingButton from './common/OnboardingButton';
import { OnboardingConnectTitle } from './common/OnboardingTitle';
import OnboardingWrapper from './common/OnboardingWrapper';
import { type SelectedWarehouse } from './types';
import { WarehouseTypeLabels, getWarehouseIcon } from './utils';

interface SelectWarehouseProps {
    isCreatingFirstProject: boolean;
    onSelect: (warehouse: SelectedWarehouse) => void;
}

const SelectWarehouse: FC<SelectWarehouseProps> = ({
    isCreatingFirstProject,
    onSelect,
}) => {
    const { user } = useApp();
    const { data: organization } = useOrganization();

    const canCreateProject = user.data?.ability?.can(
        'create',
        subject('Project', {
            organizationUuid: organization?.organizationUuid,
            type: ProjectType.DEFAULT,
        }),
    );

    const canInviteUsers = user.data?.ability?.can(
        'manage',
        subject('OrganizationMemberProfile', {
            organizationUuid: organization?.organizationUuid,
        }),
    );

    return (
        <OnboardingWrapper>
            <ProjectCreationCard>
                <Stack>
                    <OnboardingConnectTitle
                        isCreatingFirstProject={isCreatingFirstProject}
                    />

                    {canCreateProject === false && (
                        <Alert
                            icon={<MantineIcon icon={IconAlertTriangle} />}
                            color="yellow"
                            variant="light"
                            ta="left"
                        >
                            You don't have permission to create new projects.
                            Contact your Lightdash administrator to request
                            project creation access or to have a project
                            assigned to you.
                        </Alert>
                    )}

                    <Text color="dimmed">Select your warehouse:</Text>

                    <SimpleGrid cols={2} spacing="sm">
                        {WarehouseTypeLabels.map((item) => (
                            <OnboardingButton
                                key={item.key}
                                leftIcon={getWarehouseIcon(item.key)}
                                onClick={
                                    canCreateProject === false
                                        ? undefined
                                        : () => onSelect(item.key)
                                }
                                style={{
                                    opacity:
                                        canCreateProject === false ? 0.5 : 1,
                                    cursor:
                                        canCreateProject === false
                                            ? 'not-allowed'
                                            : 'pointer',
                                }}
                            >
                                {item.label}
                            </OnboardingButton>
                        ))}
                    </SimpleGrid>
                </Stack>
            </ProjectCreationCard>

            {canInviteUsers && <InviteExpertFooter />}
        </OnboardingWrapper>
    );
};

export default SelectWarehouse;
