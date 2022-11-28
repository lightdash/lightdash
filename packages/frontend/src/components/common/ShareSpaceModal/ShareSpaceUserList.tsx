import { Select2 } from '@blueprintjs/select';
import {
    LightdashUser,
    OrganizationMemberProfile,
    Space,
    SpaceShare,
} from '@lightdash/common';
import { upperFirst } from 'lodash-es';
import { FC } from 'react';
import { useDeleteSpaceShareMutation } from '../../../hooks/useSpaces';
import {
    ChangeAccessButton,
    FlexWrapper,
    PrimaryText,
    UserCircle,
    UserRole,
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

    const userIsYou = (spaceShare: SpaceShare) =>
        spaceShare.userUuid === sessionUser?.userUuid;

    return (
        <>
            {space.access
                .sort((a, b) => {
                    if (userIsYou(a) && !userIsYou(b)) return -1;
                    if (!userIsYou(a) && userIsYou(b)) return 1;
                    return 0;
                })

                .map((sharedUser) => {
                    const isYou = userIsYou(sharedUser);
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
                        <FlexWrapper key={sharedUser.userUuid}>
                            <UserCircle>
                                {getInitials(
                                    sharedUser.userUuid,
                                    organizationUsers,
                                )}
                            </UserCircle>

                            <PrimaryText>
                                {getUserNameOrEmail(
                                    sharedUser.userUuid,
                                    organizationUsers,
                                )}
                                {isYou ? <YouLabel> (you)</YouLabel> : ''}
                            </PrimaryText>

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
                                    >
                                        <UserRole>{role}</UserRole>
                                    </ChangeAccessButton>
                                </Select2>
                            )}
                        </FlexWrapper>
                    );
                })}
        </>
    );
};
