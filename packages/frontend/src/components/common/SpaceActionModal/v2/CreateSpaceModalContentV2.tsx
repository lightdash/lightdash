import { type Space } from '@lightdash/common';
import {
    Avatar,
    Group,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { type UseFormReturnType } from '@mantine/form';
import { IconLock, IconUsersGroup } from '@tabler/icons-react';
import { type FC } from 'react';
import { useProject } from '../../../../hooks/useProject';
import MantineIcon from '../../MantineIcon';
// eslint-disable-next-line css-modules/no-unused-class
import classes from '../../ShareSpaceModal/v2/ShareSpaceModalShared.module.css';
import {
    InheritanceType,
    NestedInheritanceOptions,
    RootInheritanceOptions,
} from '../../ShareSpaceModal/v2/ShareSpaceModalUtils';

type CreateSpaceModalContentV2Props = {
    form: UseFormReturnType<Space>;
    projectUuid: string;
    parentSpaceUuid: Space['parentSpaceUuid'];
    inheritanceValue: InheritanceType;
    onInheritanceChange: (value: InheritanceType) => void;
};

const CreateSpaceModalContentV2: FC<CreateSpaceModalContentV2Props> = ({
    form,
    projectUuid,
    parentSpaceUuid,
    inheritanceValue,
    onInheritanceChange,
}) => {
    const { data: project } = useProject(projectUuid);
    const isNestedSpace = !!parentSpaceUuid;

    const options = isNestedSpace
        ? NestedInheritanceOptions
        : RootInheritanceOptions;

    const currentOption =
        options.find((o) => o.value === inheritanceValue) ?? options[0];

    const label = isNestedSpace
        ? 'Parent space access'
        : `Members of ${project?.name ?? 'project'}`;

    return (
        <Stack>
            <TextInput
                {...form.getInputProps('name')}
                label="Enter a memorable name for your space"
                placeholder="eg. KPIs"
            />

            <Paper
                withBorder
                p="md"
                radius="md"
                className={classes.accessModelCard}
            >
                <Stack gap="sm">
                    <Group gap="sm" wrap="nowrap">
                        <Avatar
                            radius="xl"
                            color={
                                inheritanceValue === InheritanceType.INHERIT
                                    ? 'green'
                                    : 'orange'
                            }
                        >
                            <MantineIcon
                                icon={
                                    inheritanceValue === InheritanceType.INHERIT
                                        ? IconUsersGroup
                                        : IconLock
                                }
                            />
                        </Avatar>
                        <Stack gap={2}>
                            <Text fw={600} fz="sm">
                                {label}
                            </Text>
                            <Text c="ldGray.6" fz="xs">
                                {currentOption.description}
                            </Text>
                        </Stack>
                    </Group>

                    <SegmentedControl
                        size="xs"
                        radius="md"
                        fullWidth
                        value={inheritanceValue}
                        classNames={{
                            root: classes.segmentedControl,
                        }}
                        onChange={(value) => {
                            onInheritanceChange(value as InheritanceType);
                        }}
                        data={[
                            {
                                value: InheritanceType.INHERIT,
                                label: isNestedSpace
                                    ? 'Parent access'
                                    : 'Project access',
                            },
                            {
                                value: InheritanceType.OWN_ONLY,
                                label: 'Custom access',
                            },
                        ]}
                    />
                </Stack>
            </Paper>
        </Stack>
    );
};

export default CreateSpaceModalContentV2;
