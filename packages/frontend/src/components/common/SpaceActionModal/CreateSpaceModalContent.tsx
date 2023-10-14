import { Radio } from '@blueprintjs/core';
import {
    OrganizationMemberRole,
    ProjectMemberRole,
    SpaceShare,
} from '@lightdash/common';
import upperFirst from 'lodash-es/upperFirst';
import { FC, useMemo, useState } from 'react';
import { CreateSpaceModalBody } from '.';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import { useApp } from '../../../providers/AppProvider';
import Input from '../../ReactHookForm/Input';
import RadioGroup from '../../ReactHookForm/RadioGroup';
import {
    FlexWrapper,
    PrimaryText,
    UserCircle,
    UserRole,
    YouLabel,
} from '../ShareSpaceModal/ShareSpaceModal.style';
import {
    AccessOption,
    SpaceAccessOptions,
    SpaceAccessType,
} from '../ShareSpaceModal/ShareSpaceSelect';
import { CreateSpaceAddUser } from './CreateSpaceAddUser';
import { CreateSpaceSelectAccessType } from './CreateSpaceSelectAccessType';
import { RadioDescription, ShareSpaceWrapper } from './SpaceActionModal.style';

export enum CreateModalStep {
    SET_NAME = 'first',
    SET_ACCESS = 'second',
}

const renderUser = (user: {
    isYou?: boolean;
    userUuid: string;
    firstName: string;
    lastName: string;
    role: string;
}) => {
    return (
        <FlexWrapper key={user.userUuid}>
            <UserCircle>
                {user.firstName.substr(0, 1) + user.lastName.substr(0, 1)}
            </UserCircle>

            <PrimaryText>
                {user.firstName + ' ' + user.lastName}
                {user.isYou && <YouLabel> (you)</YouLabel>}
            </PrimaryText>
            <UserRole>{upperFirst(user.role)}</UserRole>
        </FlexWrapper>
    );
};
const CreateSpaceModalContent: FC<CreateSpaceModalBody> = ({
    modalStep,
    projectUuid,
    form,
    setIsShared,
    organizationUsers,
}) => {
    const {
        user: { data: sessionUser },
    } = useApp();
    const [selectedAccess, setSelectedAccess] = useState<AccessOption>(
        SpaceAccessOptions[0],
    );

    const { data: projectAccess } = useProjectAccess(projectUuid);

    const adminUsers = useMemo(() => {
        const projectUserUuids =
            projectAccess
                ?.filter((access) => access.role === ProjectMemberRole.ADMIN)
                .map((access) => access.userUuid) || [];
        const organizationUserUuids =
            organizationUsers
                ?.filter(
                    (access) => access.role === OrganizationMemberRole.ADMIN,
                )
                .map((access) => access.userUuid) || [];

        const userUuids = [
            ...new Set([...projectUserUuids, ...organizationUserUuids]),
        ];
        return userUuids.reduce<SpaceShare[]>((acc, userUuid) => {
            const user = organizationUsers?.find(
                (orgUser) => orgUser.userUuid === userUuid,
            );
            if (sessionUser?.userUuid === userUuid) return acc;
            if (user) {
                return [
                    ...acc,
                    {
                        ...user,
                        firstName: user.firstName || user.email,
                        role: ProjectMemberRole.ADMIN,
                    },
                ];
            } else return acc;
        }, []);
    }, [organizationUsers, projectAccess, sessionUser?.userUuid]);

    switch (modalStep) {
        case CreateModalStep.SET_NAME:
            return (
                <>
                    <Input
                        label="Enter a memorable name for your space"
                        name="name"
                        placeholder="eg. KPIs"
                        defaultValue=""
                        rules={{ required: 'Name field is required' }}
                    />
                    <RadioGroup
                        name="private"
                        defaultValue={SpaceAccessType.PRIVATE}
                    >
                        <Radio
                            label="Private"
                            value={SpaceAccessType.PRIVATE}
                            onClick={() => {
                                setIsShared(false);
                                form.setValue('isPrivate', true);
                            }}
                        />
                        <RadioDescription>
                            Only you and admins can access this space.
                        </RadioDescription>
                        <Radio
                            label="Shared"
                            value={SpaceAccessType.SHARED}
                            onClick={() => {
                                setIsShared(true);
                                form.setValue('isPrivate', true);
                            }}
                        />
                        <RadioDescription>
                            Only invited members and admins can access this
                            space.
                        </RadioDescription>
                        <Radio
                            label="Public"
                            value={SpaceAccessType.PUBLIC}
                            onClick={() => {
                                setIsShared(false);
                                form.setValue('isPrivate', false);
                            }}
                        />
                        <RadioDescription>
                            Everyone can access this space.
                        </RadioDescription>
                    </RadioGroup>
                </>
            );

        default:
            return (
                <ShareSpaceWrapper>
                    {selectedAccess?.value === SpaceAccessType.PRIVATE && (
                        <CreateSpaceAddUser
                            projectUuid={projectUuid}
                            form={form}
                        />
                    )}

                    {adminUsers?.map((user) =>
                        renderUser({ ...user, role: ProjectMemberRole.ADMIN }),
                    )}

                    {sessionUser &&
                        selectedAccess?.value === SpaceAccessType.PRIVATE &&
                        renderUser({
                            ...sessionUser,
                            role: sessionUser.role!,
                            isYou: true,
                        })}
                </ShareSpaceWrapper>
            );
    }
};

export default CreateSpaceModalContent;
