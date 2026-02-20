import {
    Avatar,
    Box,
    Button,
    Group,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { IconArrowLeft, IconLock, IconUsersGroup } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../MantineIcon';
// eslint-disable-next-line css-modules/no-unused-class
import classes from '../ShareSpaceModal/v2/ShareSpaceModalShared.module.css';
import {
    InheritanceType,
    NestedInheritanceOptions,
    RootInheritanceOptions,
} from '../ShareSpaceModal/v2/ShareSpaceModalUtils';

type SpaceCreationFormV2Props = {
    spaceName: string;
    onSpaceNameChange: (name: string) => void;
    onCancel: () => void;
    isLoading?: boolean;
    parentSpaceName?: string;
    inheritanceValue: InheritanceType;
    onInheritanceChange: (value: InheritanceType) => void;
};

const SpaceCreationFormV2: FC<SpaceCreationFormV2Props> = ({
    spaceName,
    onSpaceNameChange,
    onCancel,
    isLoading,
    parentSpaceName,
    inheritanceValue,
    onInheritanceChange,
}) => {
    const isNestedSpace = !!parentSpaceName;

    const options = isNestedSpace
        ? NestedInheritanceOptions
        : RootInheritanceOptions;

    const currentOption =
        options.find((o) => o.value === inheritanceValue) ?? options[0];

    const label = isNestedSpace ? 'Parent space access' : 'Project access';

    return (
        <Stack gap="xs">
            <Box>
                <Button
                    variant="subtle"
                    leftSection={<MantineIcon icon={IconArrowLeft} />}
                    onClick={onCancel}
                    disabled={isLoading}
                    size="xs"
                >
                    Back to Space selection
                </Button>
            </Box>

            <Text fz="sm" fw={500}>
                You are creating a new space
                {parentSpaceName ? (
                    <>
                        {' '}
                        in{' '}
                        <Text span fw={600}>
                            &ldquo;{parentSpaceName}&rdquo;
                        </Text>
                    </>
                ) : null}
                .
            </Text>

            <TextInput
                label="Name"
                placeholder="Space name"
                required
                disabled={isLoading}
                value={spaceName}
                onChange={(e) => onSpaceNameChange(e.target.value)}
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
                        disabled={isLoading}
                    />
                </Stack>
            </Paper>
        </Stack>
    );
};

export default SpaceCreationFormV2;
