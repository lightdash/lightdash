import {
    Menu,
    PopoverInteractionKind,
    PopoverPosition,
} from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { FC } from 'react';
import { useHistory } from 'react-router-dom';
import useLogoutMutation from '../../../hooks/user/useUserLogoutMutation';
import { useApp } from '../../../providers/AppProvider';
import { UserAvatar } from '../../Avatar';

const UserMenu: FC = () => {
    const { user } = useApp();
    const { mutate } = useLogoutMutation();
    const history = useHistory();

    return (
        <Popover2
            interactionKind={PopoverInteractionKind.CLICK}
            content={
                <Menu>
                    <MenuItem2
                        role="menuitem"
                        onClick={() => {
                            history.push('/generalSettings');
                        }}
                        icon="settings"
                        text="User settings"
                    />
                    {user.data?.ability?.can('create', 'InviteLink') ? (
                        <MenuItem2
                            role="menuitem"
                            onClick={() => {
                                history.push(
                                    '/generalSettings/userManagement?to=invite',
                                );
                            }}
                            icon="new-person"
                            text="Invite user"
                        />
                    ) : null}
                    <MenuItem2
                        role="menuitem"
                        icon="log-out"
                        text="Logout"
                        onClick={() => mutate()}
                    />
                </Menu>
            }
            position={PopoverPosition.BOTTOM_LEFT}
        >
            <UserAvatar />
        </Popover2>
    );
};

export default UserMenu;
