import { Button, Menu, PopoverPosition } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { useActiveProjectUuid } from '../../../hooks/useProject';
import { useApp } from '../../../providers/AppProvider';

const SettingsMenu: FC = () => {
    const { user } = useApp();
    const history = useHistory();
    const activeProjectUuid = useActiveProjectUuid();

    const userCanManageProjects = user.data?.ability?.can('manage', 'Project');
    const userCanManageOrganization = user.data?.ability?.can(
        'manage',
        'Organization',
    );

    if (!userCanManageProjects && !userCanManageOrganization) {
        return null;
    }

    return (
        <Popover2
            captureDismiss
            position={PopoverPosition.BOTTOM_RIGHT}
            content={
                <Menu>
                    {activeProjectUuid && userCanManageProjects && (
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
