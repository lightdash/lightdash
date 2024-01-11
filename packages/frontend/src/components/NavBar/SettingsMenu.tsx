import { subject } from '@casl/ability';
import {
    IconBuildingBank,
    IconDatabase,
    IconSettings,
} from '@tabler/icons-react';
import { FC } from 'react';

import { Button, Menu } from '@mantine/core';
import { Link } from 'react-router-dom';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useApp } from '../../providers/AppProvider';
import MantineIcon from '../common/MantineIcon';

const SettingsMenu: FC = () => {
    const {
        user: { data: user },
    } = useApp();
    const { activeProjectUuid } = useActiveProjectUuid();

    if (!user || !activeProjectUuid) return null;

    const userCanViewOrganization = user.ability.can(
        'update',
        subject('Organization', {
            organizationUuid: user.organizationUuid,
        }),
    );

    const userCanCreateProject = user.ability.can(
        'update',
        subject('Project', {
            organizationUuid: user.organizationUuid,
        }),
    );

    if (!userCanViewOrganization && !userCanCreateProject) {
        return null;
    }

    return (
        <Menu
            withArrow
            shadow="lg"
            position="bottom-end"
            arrowOffset={16}
            offset={-2}
        >
            <Menu.Target>
                <Button variant="default" size="xs" data-testid="settings-menu">
                    <MantineIcon icon={IconSettings} />
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                {activeProjectUuid && userCanCreateProject && (
                    <Menu.Item
                        component={Link}
                        icon={<MantineIcon icon={IconDatabase} />}
                        to={`/generalSettings/projectManagement/${activeProjectUuid}/settings`}
                    >
                        Project settings
                    </Menu.Item>
                )}

                {userCanViewOrganization && (
                    <Menu.Item
                        component={Link}
                        icon={<MantineIcon icon={IconBuildingBank} />}
                        to={`/generalSettings/organization`}
                    >
                        Organization settings
                    </Menu.Item>
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

export default SettingsMenu;
