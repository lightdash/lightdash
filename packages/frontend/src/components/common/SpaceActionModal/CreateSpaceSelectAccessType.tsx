import { Icon } from '@blueprintjs/core';
import { Select2 } from '@blueprintjs/select';
import { Space } from '@lightdash/common';
import { FC } from 'react';
import { useParams } from 'react-router-dom';
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
} from '../ShareSpaceModal/ShareSpaceModal.style';
import {
    AccessOption,
    renderAccess,
    SpaceAccessOptions,
    SpaceAccessType,
} from '../ShareSpaceModal/ShareSpaceSelect';

interface ShareSpaceAccessTypeProps {
    selectedAccess: AccessOption;
    setSelectedAccess: (access: AccessOption) => void;
}

export const CreateSpaceSelectAccessType: FC<ShareSpaceAccessTypeProps> = ({
    selectedAccess,
    setSelectedAccess,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { data: project } = useProject(projectUuid);

    return (
        <FlexWrapper>
            <ShareCircle>
                <Icon
                    icon={
                        selectedAccess.value === SpaceAccessType.PRIVATE
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
