import { Button, Menu, PopoverPosition } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { useActiveProjectUuid } from '../../../hooks/useProject';
import { useApp } from '../../../providers/AppProvider';

const SettingsMenu: FC = () => {
    const {
        user: { data: user },
    } = useApp();
    const history = useHistory();
    const activeProjectUuid = useActiveProjectUuid();

    if (!user) return null;

    const userCanViewOrganization = user.ability.can(
        'view',
        subject('Organization', {
            organizationUuid: user.organizationUuid,
        }),
    );

    const userCanViewCurrentProject = user.ability.can(
        'view',
        subject('Project', {
            organizationUuid: user.organizationUuid,
            projectUuid: activeProjectUuid,
        }),
    );

    if (!userCanViewOrganization && !userCanViewCurrentProject) {
        return null;
    }

    return (
        <Popover2
            captureDismiss
            position={PopoverPosition.BOTTOM_RIGHT}
            content={
                <Menu>
                    {activeProjectUuid && userCanViewCurrentProject && (
                        <MenuItem2
                            role="menuitem"
                            icon="database"
                            text="Project settings"
                            onClick={() => {
                                history.push(
                                    `/generalSettings/projectManagement/${activeProjectUuid}`,
                                );
                            }}
                        />
                    )}

                    {userCanViewOrganization && (
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
