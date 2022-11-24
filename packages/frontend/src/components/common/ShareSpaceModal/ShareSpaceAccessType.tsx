import { Icon } from '@blueprintjs/core';
import { Select2 } from '@blueprintjs/select';
import { Space } from '@lightdash/common';
import { FC } from 'react';
import { useProject } from '../../../hooks/useProject';
import { useUpdateMutation } from '../../../hooks/useSpaces';
import {
    AccessDescription,
    AccessName,
    AccessRole,
    AccessWrapper,
    ChangeAccessButton,
    MemberAccess,
    ShareTag,
    UserRole,
} from './ShareSpaceModal.style';
import {
    AccessOption,
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
        <AccessWrapper>
            <ShareTag>
                <Icon
                    icon={
                        selectedAccess.value === SpaceAccessType.PRIVATE
                            ? 'lock'
                            : 'people'
                    }
                />
            </ShareTag>

            <MemberAccess>
                <AccessName>Members of {project?.name}</AccessName>
                <AccessDescription>
                    {selectedAccess.description}
                </AccessDescription>
            </MemberAccess>

            <AccessRole>
                <Select2<AccessOption>
                    filterable={false}
                    items={SpaceAccessOptions}
                    itemRenderer={renderAccess}
                    activeItem={SpaceAccessOptions.find(
                        (option) => option.value === selectedAccess.value,
                    )}
                    onItemSelect={(item) => {
                        const isPrivate =
                            item.value === SpaceAccessType.PRIVATE;

                        if (isPrivate !== space.isPrivate) {
                            setSelectedAccess(item);
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
        </AccessWrapper>
    );
};
