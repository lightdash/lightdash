import {
    type AiArtifact,
    type Dashboard,
    type ToolDashboardV2Args,
} from '@lightdash/common';
import { ActionIcon, Menu } from '@mantine/core';
import {
    IconDeviceFloppy,
    IconDots,
    IconTableShortcut,
} from '@tabler/icons-react';
import { Fragment, useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useContentAuthoringEnabled } from '../../../../../hooks/useContentAuthoringEnabled';
import useCreateInAnySpaceAccess from '../../../../../hooks/user/useCreateInAnySpaceAccess';
import { useEmbedAiAgentDashboardOpener } from '../../hooks/useEmbedAiAgentDashboardOpener';
import { AiDashboardSaveModal } from './AiDashboardSaveModal';

type Props = {
    artifactData: AiArtifact;
    projectUuid: string;
    agentUuid: string;
    dashboardConfig: ToolDashboardV2Args;
};

export const AiDashboardQuickOptions: FC<Props> = ({
    artifactData,
    projectUuid,
    agentUuid,
    dashboardConfig,
}) => {
    const authoringEnabled = useContentAuthoringEnabled();
    const openEmbedDashboard = useEmbedAiAgentDashboardOpener(projectUuid);
    const [isModalOpen, setIsModalOpen] = useState(false);
    // The save modal only lists spaces the user can write to, so without one
    // the option opens an empty space picker.
    const canSaveDashboard = useCreateInAnySpaceAccess(
        projectUuid,
        'Dashboard',
    );

    const handleSaveDashboard = () => {
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const { savedDashboardUuid } = artifactData;

    const handleSaveSuccess = (_dashboard: Dashboard) => {
        // TODO persist on artifact
        setIsModalOpen(false);
    };

    // Nothing to view and nothing to save leaves an empty dropdown.
    if (!savedDashboardUuid && (!canSaveDashboard || !authoringEnabled)) {
        return null;
    }

    return (
        <Fragment>
            <Menu withArrow>
                <Menu.Target>
                    <ActionIcon size="sm" color="ldGray.9">
                        <MantineIcon icon={IconDots} size="lg" />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Label>Quick actions</Menu.Label>
                    {savedDashboardUuid ? (
                        openEmbedDashboard ? (
                            <Menu.Item
                                onClick={() =>
                                    openEmbedDashboard(savedDashboardUuid)
                                }
                                leftSection={
                                    <MantineIcon icon={IconTableShortcut} />
                                }
                            >
                                View saved dashboard
                            </Menu.Item>
                        ) : (
                            <Menu.Item
                                component={Link}
                                to={`/projects/${projectUuid}/dashboards/${savedDashboardUuid}`}
                                target="_blank"
                                leftSection={
                                    <MantineIcon icon={IconTableShortcut} />
                                }
                            >
                                View saved dashboard
                            </Menu.Item>
                        )
                    ) : (
                        canSaveDashboard && (
                            <Menu.Item
                                display={authoringEnabled ? undefined : 'none'}
                                onClick={handleSaveDashboard}
                                leftSection={
                                    <MantineIcon icon={IconDeviceFloppy} />
                                }
                            >
                                Save dashboard
                            </Menu.Item>
                        )
                    )}
                </Menu.Dropdown>
            </Menu>

            <AiDashboardSaveModal
                opened={isModalOpen && authoringEnabled}
                onClose={handleCloseModal}
                artifactData={artifactData}
                projectUuid={projectUuid}
                agentUuid={agentUuid}
                dashboardConfig={dashboardConfig}
                onSuccess={handleSaveSuccess}
            />
        </Fragment>
    );
};
