import {
    Menu,
    PopoverInteractionKind,
    PopoverPosition,
} from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { FC } from 'react';
import useLogoutMutation from '../../../hooks/user/useUserLogoutMutation';
import { useApp } from '../../../providers/AppProvider';
import { UserAvatar } from '../../Avatar';

const UserMenu: FC = () => {
    const { user } = useApp();
    const { mutate } = useLogoutMutation();

    return (
        <Popover2
            interactionKind={PopoverInteractionKind.CLICK}
            content={
                <Menu>
                    {user.data?.ability?.can('create', 'InviteLink') ? (
                        <MenuItem2
                            href={`/generalSettings/userManagement?to=invite`}
                            icon="new-person"
                            text="Invite user"
                        />
                    ) : null}
                    <MenuItem2
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
