import { Button, Menu, PopoverPosition } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { useActiveProjectUuid } from '../../../hooks/useProject';

const SettingsMenu: FC = () => {
    const history = useHistory();
    const activeProjectUuid = useActiveProjectUuid();

    return (
        <Popover2
            captureDismiss
            position={PopoverPosition.BOTTOM_RIGHT}
            content={
                <Menu>
                    <MenuItem2
                        icon="database"
                        text="Project settings"
                        onClick={() => {
                            history.push(
                                `/projects/${activeProjectUuid}/settings`,
                            );
                        }}
                    />
                    <MenuItem2
                        icon="office"
                        text="Organization settings"
                        onClick={() => {
                            history.push(`/generalSettings`);
                        }}
                    />
                </Menu>
            }
        >
            <Button minimal icon="cog" data-cy="settings-button" />
        </Popover2>
    );
};

export default SettingsMenu;
