import { Select2 } from '@blueprintjs/select';
import { Avatar, Group } from '@mantine/core';
import { IconLock, IconUsers } from '@tabler/icons-react';
import { FC } from 'react';
import { useProject } from '../../../hooks/useProject';
import MantineIcon from '../MantineIcon';
import {
    AccessRole,
    ChangeAccessButton,
    PrimaryAndSecondaryTextWrapper,
    PrimaryText,
    SecondaryText,
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
    projectUuid: string;
    setSelectedAccess: (access: AccessOption) => void;
}

export const CreateSpaceSelectAccessType: FC<ShareSpaceAccessTypeProps> = ({
    selectedAccess,
    projectUuid,
    setSelectedAccess,
}) => {
    const { data: project } = useProject(projectUuid);

    return (
        <Group>
            <Avatar radius="xl">
                <MantineIcon
                    icon={
                        selectedAccess.value === SpaceAccessType.PRIVATE
                            ? IconLock
                            : IconUsers
                    }
                />
            </Avatar>

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
        </Group>
    );
};
