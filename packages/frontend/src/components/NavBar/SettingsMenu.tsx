import { subject } from '@casl/ability';
import { Button, getDefaultZIndex, Menu } from '@mantine/core';
import {
    IconBuildingBank,
    IconDatabase,
    IconSettings,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useIsTrainingCopy } from '../../features/scopeTours/useIsTrainingCopy';
import {
    getProjectSettingsAccess,
    LEARNER_COPY_SETTINGS_PAGE,
} from '../../hooks/settings/projectSettingsAccess';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useProject } from '../../hooks/useProject';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import { useNavBarMenuProps } from './NavBarPortalContext';

const SettingsMenu: FC<{ withLabel?: boolean }> = ({ withLabel = false }) => {
    const menuProps = useNavBarMenuProps();
    const {
        user: { data: user },
    } = useApp();
    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: project } = useProject(activeProjectUuid);
    const { isTrainingCopy } = useIsTrainingCopy(project);

    if (!user || !activeProjectUuid) return null;

    const userCanViewOrganization = user.ability.can(
        'update',
        subject('Organization', {
            organizationUuid: user.organizationUuid,
        }),
    );

    const projectSettingsAccess = getProjectSettingsAccess({
        ability: user.ability,
        project: user.organizationUuid
            ? {
                  organizationUuid: user.organizationUuid,
                  projectUuid: activeProjectUuid,
              }
            : undefined,
        isTrainingCopy,
    });

    if (!userCanViewOrganization && projectSettingsAccess === 'none') {
        return null;
    }

    return (
        <Menu
            position="bottom-end"
            arrowOffset={16}
            offset={-2}
            zIndex={getDefaultZIndex('max')}
            {...menuProps}
        >
            <Menu.Target>
                <Button
                    aria-label="Settings"
                    variant="default"
                    size="xs"
                    data-testid="settings-menu"
                    // Navigation anchor for scope walkthroughs (data-tour-via)
                    data-tour-nav="settings"
                    data-tour-hint="Click Settings"
                >
                    <MantineIcon icon={IconSettings} />
                    {withLabel && ' Settings'}
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                {projectSettingsAccess !== 'none' && (
                    <Menu.Item
                        component={Link}
                        leftSection={<MantineIcon icon={IconDatabase} />}
                        // A learner copy's settings hold the Validator alone
                        to={`/generalSettings/projectManagement/${activeProjectUuid}/${
                            projectSettingsAccess === 'learnerCopy'
                                ? LEARNER_COPY_SETTINGS_PAGE
                                : 'settings'
                        }`}
                        data-tour-nav="project-settings"
                        data-tour-hint="Open Project settings"
                    >
                        Project settings
                    </Menu.Item>
                )}

                {userCanViewOrganization && (
                    <Menu.Item
                        component={Link}
                        leftSection={<MantineIcon icon={IconBuildingBank} />}
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
