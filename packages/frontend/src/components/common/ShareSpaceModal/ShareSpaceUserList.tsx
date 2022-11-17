import { Select2 } from '@blueprintjs/select';
import {
    LightdashUser,
    OrganizationMemberProfile,
    Space,
} from '@lightdash/common';
import { upperFirst } from 'lodash-es';
import { FC } from 'react';
import { useDeleteSpaceShareMutation } from '../../../hooks/useSpaces';
import {
    AddUsersWrapper,
    ChangeAccessButton,
    ListUserWrapper,
    UserName,
    UserRole,
    UserTag,
    YouLabel,
} from './ShareSpaceModal.style';
import { AccessOption, renderAccess } from './ShareSpaceSelect';
import { getInitials, getUserNameOrEmail } from './Utils';

export interface ShareSpaceUserListProps {
    space: Space;
    sessionUser: LightdashUser | undefined;
    projectUuid: string;
    organizationUsers: OrganizationMemberProfile[] | undefined;
}

const enum UserAccessAction {
    KEEP = 'keep',
    DELETE = 'delete',
}

const UserAccessOptions: AccessOption[] = [
    {
        title: 'viewer',
        selectDescription: `This permission has been inherited from user's project access`,
        value: UserAccessAction.KEEP,
    },
    {
        title: 'No access',
        selectDescription: `Remove user's access`,
        value: UserAccessAction.DELETE,
    },
];

export const ShareSpaceUserList: FC<ShareSpaceUserListProps> = ({
    space,
    projectUuid,
    sessionUser,
    organizationUsers,
}) => {
    const { mutate: unshareSpaceMutation } = useDeleteSpaceShareMutation(
        projectUuid,
        space.uuid,
    );

    return (
        <>
            {space.access &&
                space.access.map((sharedUser) => {
                    const isYou = sessionUser?.userUuid === sharedUser.userUuid;
                    const role = upperFirst(sharedUser.role?.toString() || '');

                    const userAccessTypes = UserAccessOptions.map(
                        (accessType) => {
                            return accessType.value === UserAccessAction.KEEP
                                ? {
                                      ...accessType,
                                      title: role,
                                  }
                                : accessType;
                        },
                    );
                    return (
                        <ListUserWrapper key={sharedUser.userUuid}>
                            <UserTag round large>
                                {getInitials(
                                    sharedUser.userUuid,
                                    organizationUsers,
                                )}
                            </UserTag>
                            <UserName>
                                {getUserNameOrEmail(
                                    sharedUser.userUuid,
                                    organizationUsers,
                                )}
                                {isYou ? <YouLabel> (you)</YouLabel> : ''}
                            </UserName>
                            {isYou ? (
                                <UserRole>{role}</UserRole>
                            ) : (
                                <Select2<AccessOption>
                                    filterable={false}
                                    items={userAccessTypes}
                                    itemRenderer={renderAccess}
                                    onItemSelect={(item) => {
                                        if (
                                            item.value ===
                                            UserAccessAction.DELETE
                                        ) {
                                            unshareSpaceMutation(
                                                sharedUser.userUuid,
                                            );
                                        }
                                    }}
                                    popoverProps={{
                                        placement: 'bottom-end',
                                    }}
                                >
                                    <ChangeAccessButton
                                        minimal
                                        rightIcon="caret-down"
                                        text={role}
                                    />
                                </Select2>
                            )}
                        </ListUserWrapper>
                    );
                })}
        </>
    );
};
