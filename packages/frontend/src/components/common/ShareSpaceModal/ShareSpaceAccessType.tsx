import { Space } from '@lightdash/common';
import { Avatar, Flex, Group, Select, Stack, Text } from '@mantine/core';
import { IconLock, IconUsers } from '@tabler/icons-react';
import { FC, forwardRef } from 'react';
import { useProject } from '../../../hooks/useProject';
import { useUpdateMutation } from '../../../hooks/useSpaces';
import MantineIcon from '../MantineIcon';
import {
    AccessOption,
    SpaceAccessOptions,
    SpaceAccessType,
} from './ShareSpaceSelect';

interface ShareSpaceAccessTypeProps {
    space: Space;
    projectUuid: string;
    selectedAccess: AccessOption;
    setSelectedAccess: (access: AccessOption) => void;
}

const SelectItem = forwardRef<HTMLDivElement, AccessOption>(
    (
        {
            title,
            description,
            ...others
        }: React.ComponentPropsWithoutRef<'div'> & AccessOption,
        ref,
    ) => (
        <Stack ref={ref} {...others} spacing={1}>
            <Text fz="sm">{title}</Text>
            <Text fz="xs" opacity={0.65}>
                {description}
            </Text>
        </Stack>
    ),
);

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
        <Group position="apart">
            <Flex align="center" gap="sm">
                <Avatar
                    radius="xl"
                    color={
                        selectedAccess.value === SpaceAccessType.PRIVATE
                            ? 'orange'
                            : 'green'
                    }
                >
                    <MantineIcon
                        icon={
                            selectedAccess.value === SpaceAccessType.PRIVATE
                                ? IconLock
                                : IconUsers
                        }
                    />
                </Avatar>

                <Stack spacing={2}>
                    <Text fw={600} fz="sm">
                        Members of {project?.name}
                    </Text>
                    <Text c="gray.6" fz="xs">
                        {selectedAccess.description}
                    </Text>
                </Stack>
            </Flex>

            {selectedAccess && (
                <Select
                    styles={{
                        input: {
                            fontWeight: 500,
                        },
                    }}
                    size="xs"
                    withinPortal
                    value={selectedAccess.value}
                    data={SpaceAccessOptions.map((s) => ({
                        label: s.title,
                        ...s,
                    }))}
                    itemComponent={SelectItem}
                    onChange={(item) => {
                        const spaceAccessOption = SpaceAccessOptions.find(
                            (s) => s.value === item,
                        );
                        const isPrivate =
                            spaceAccessOption?.value ===
                            SpaceAccessType.PRIVATE;

                        if (
                            spaceAccessOption &&
                            isPrivate !== space.isPrivate
                        ) {
                            setSelectedAccess(spaceAccessOption);
                            spaceMutation({
                                name: space.name,
                                isPrivate: isPrivate,
                            });
                        }
                    }}
                />
            )}
        </Group>
    );
};
