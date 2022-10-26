import { Button, Menu, PopoverPosition } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { useActiveProjectUuid } from '../../../hooks/useProject';
import { useApp } from '../../../providers/AppProvider';

const SettingsMenu: FC = () => {
    const { user } = useApp();
    const history = useHistory();
    const activeProjectUuid = useActiveProjectUuid();

    const userCanManageOrganization = user.data?.ability?.can(
        'manage',
        subject('Organization', {
            organizationUuid: user.data?.organizationUuid,
        }),
    );

    const userCanManageCurrentProject = user.data?.ability?.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid: activeProjectUuid,
        }),
    );

    if (!userCanManageOrganization && !userCanManageCurrentProject) {
        return null;
    }

    return (
        <Popover2
            captureDismiss
            position={PopoverPosition.BOTTOM_RIGHT}
            content={
                <Menu>
                    {activeProjectUuid && userCanManageCurrentProject && (
                        <MenuItem2
                            role="menuitem"
                            icon="database"
                            text="Project settings"
                            onClick={() => {
                                history.push(
                                    `/projects/${activeProjectUuid}/settings`,
                                );
                            }}
                        />
                    )}

                    {userCanManageOrganization && (
                        <MenuItem2
                            role="menuitem"
                            icon="office"
                            text="Organization settings"
                            onClick={() => {
                                history.push(`/generalSettings/organization`);
                            }}
                        />
                    )}
                </Menu>
            }
        >
            <Button minimal icon="cog" data-testid="settings-menu" />
        </Popover2>
    );
};

export default SettingsMenu;
