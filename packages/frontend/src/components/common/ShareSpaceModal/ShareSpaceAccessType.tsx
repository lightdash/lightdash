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
    getSpaceAccess,
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

    const { mutateAsync: spaceMutation } = useUpdateMutation(
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
                    activeItem={selectedAccess}
                    onItemSelect={(item) => {
                        const itemSelectFunc = async () => {
                            let spaceAccess = getSpaceAccess(space);
                            setSelectedAccess(item);
                            if (spaceAccess.value !== item.value) {
                                if (spaceAccess.value !== SpaceAccessType.PUBLIC && item.value !== SpaceAccessType.PUBLIC) {
                                    // FIXME: this is a hack to empty `access` as switching from SHARED -> PRIVATE -> SHARED doesn't do anything as they both have `isPrivate === true`
                                    await spaceMutation({
                                        name: space.name,
                                        isPrivate: !space.isPrivate,
                                    });
                                    await spaceMutation({
                                        name: space.name,
                                        isPrivate: space.isPrivate,
                                    });
                                }
                                else {
                                    await spaceMutation({
                                        name: space.name,
                                        isPrivate: item.value !== SpaceAccessType.PUBLIC,
                                    });
                                }
                            }
                        }
                        itemSelectFunc();
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
