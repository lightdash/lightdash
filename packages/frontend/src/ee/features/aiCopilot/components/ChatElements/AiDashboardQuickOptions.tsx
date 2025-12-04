import {
    type AiArtifact,
    type Dashboard,
    type ToolDashboardArgs,
} from '@lightdash/common';
import { ActionIcon, Menu } from '@mantine-8/core';
import {
    IconDeviceFloppy,
    IconDots,
    IconTableShortcut,
} from '@tabler/icons-react';
import { Fragment, useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { AiDashboardSaveModal } from './AiDashboardSaveModal';

type Props = {
    artifactData: AiArtifact;
    projectUuid: string;
    agentUuid: string;
    dashboardConfig: ToolDashboardArgs;
};

export const AiDashboardQuickOptions: FC<Props> = ({
    artifactData,
    projectUuid,
    agentUuid,
    dashboardConfig,
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleSaveDashboard = () => {
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const handleSaveSuccess = (_dashboard: Dashboard) => {
        // TODO persist on artifact
        setIsModalOpen(false);
    };

    return (
        <Fragment>
            <Menu withArrow>
                <Menu.Target>
                    <ActionIcon size="sm" variant="subtle" color="ldGray.9">
                        <MantineIcon icon={IconDots} size="lg" />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Label>Quick actions</Menu.Label>
                    {artifactData.savedDashboardUuid ? (
                        <Menu.Item
                            component={Link}
                            to={`/projects/${projectUuid}/dashboards/${artifactData.savedDashboardUuid}`}
                            target="_blank"
                            leftSection={
                                <MantineIcon icon={IconTableShortcut} />
                            }
                        >
                            View saved dashboard
                        </Menu.Item>
                    ) : (
                        <Menu.Item
                            onClick={handleSaveDashboard}
                            leftSection={
                                <MantineIcon icon={IconDeviceFloppy} />
                            }
                        >
                            Save dashboard
                        </Menu.Item>
                    )}
                </Menu.Dropdown>
            </Menu>

            <AiDashboardSaveModal
                opened={isModalOpen}
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
