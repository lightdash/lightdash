import { Icon } from '@blueprintjs/core';
import { Select2 } from '@blueprintjs/select';
import { Space } from '@lightdash/common';
import { FC } from 'react';
import { useProject } from '../../../hooks/useProject';
import { useUpdateMutation } from '../../../hooks/useSpaces';
import {
    AccessRole,
    ChangeAccessButton,
    FlexWrapper,
    PrimaryAndSecondaryTextWrapper,
    PrimaryText,
    SecondaryText,
    ShareCircle,
    UserRole,
} from './ShareSpaceModal.style';
import {
    AccessOption,
    getSpacePermissionValue,
    renderAccess,
    SpaceAccessOptions,
    SpaceAccessType,
} from './ShareSpaceSelect';

interface ShareSpaceAccessTypeProps {
    space: Space;
    projectUuid: string;
    selectedAccess: AccessOption;
    setSelectedAccess: (access: AccessOption) => void;
}

export const ShareSpaceAccessType: FC<ShareSpaceAccessTypeProps> = ({
    space,
    projectUuid,
    selectedAccess,
    setSelectedAccess,
}) => {
    const { data: project } = useProject(projectUuid);

    const { mutate: spaceMutation } = useUpdateMutation(
        projectUuid,
        space.uuid,
    );
    return (
        <FlexWrapper>
            <ShareCircle>
                <Icon
                    icon={
                        selectedAccess.value !== SpaceAccessType.PUBLIC
                            ? 'lock'
                            : 'people'
                    }
                />
            </ShareCircle>

            <PrimaryAndSecondaryTextWrapper>
                <PrimaryText>Members of {project?.name}</PrimaryText>
                <SecondaryText>{selectedAccess.description}</SecondaryText>
            </PrimaryAndSecondaryTextWrapper>

            <AccessRole>
                <Select2<AccessOption>
                    filterable={false}
                    items={SpaceAccessOptions}
                    itemRenderer={renderAccess}
                    activeItem={SpaceAccessOptions.find(
                        (option) => option.value === selectedAccess.value,
                    )}
                    onItemSelect={(item) => {
                        setSelectedAccess(item);
                        let spacePermission = getSpacePermissionValue(space);
                        if (spacePermission !== item.value) {
                            const isPrivate = spacePermission !== SpaceAccessType.PUBLIC ? true : false;
                            // FIXME: this is a hack to empty `access` as switching from SHARED -> PRIVATE -> SHARED doesn't do anything as they both have `isPrivate === true`
                            spaceMutation({
                                name: space.name,
                                isPrivate: isPrivate,
                            });
                            spaceMutation({
                                name: space.name,
                                isPrivate: !(isPrivate),
                            });
                            spaceMutation({
                                name: space.name,
                                isPrivate: isPrivate,
                            });
                        }
                    }}
                    popoverProps={{
                        minimal: true,
                        position: 'bottom-right',
                    }}
                >
                    <ChangeAccessButton minimal rightIcon="caret-down">
                        <UserRole>{selectedAccess.title}</UserRole>
                    </ChangeAccessButton>
                </Select2>
            </AccessRole>
        </FlexWrapper>
    );
};
