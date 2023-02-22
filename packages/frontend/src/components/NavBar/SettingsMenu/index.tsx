import { Button, Colors, Menu, PopoverPosition } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import {
    IconBuildingBank,
    IconDatabase,
    IconSettings,
} from '@tabler/icons-react';
import { FC } from 'react';
import { useActiveProjectUuid } from '../../../hooks/useProject';
import { useApp } from '../../../providers/AppProvider';
import LinkMenuItem from '../../common/LinkMenuItem';

const SettingsMenu: FC = () => {
    const {
        user: { data: user },
    } = useApp();
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
                        <LinkMenuItem
                            text="Project settings"
                            icon={<IconDatabase size={17} />}
                            href={`/generalSettings/projectManagement/${activeProjectUuid}`}
                        />
                    )}

                    {userCanViewOrganization && (
                        <LinkMenuItem
                            text="Organization settings"
                            icon={<IconBuildingBank size={17} />}
                            href={`/generalSettings/organization`}
                        />
                    )}
                </Menu>
            }
        >
            <Button
                minimal
                icon={<IconSettings size={20} color={Colors.GRAY4} />}
                data-testid="settings-menu"
            />
        </Popover2>
    );
};

export default SettingsMenu;
