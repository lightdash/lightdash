import {
    Box,
    Button,
    Collapse,
    Group,
    Paper,
    Stack,
    Text,
} from '@mantine-8/core';
import { IconChevronDown, IconX } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import Tree from '../../../../components/common/Tree/Tree';
import { useSpaceSummaries } from '../../../../hooks/useSpaces';
import classes from './SpaceAccessSelect.module.css';

type SpaceAccessSelectProps = {
    projectUuid: string;
    value: string[];
    onChange: (value: string[]) => void;
};

export const SpaceAccessSelect: FC<SpaceAccessSelectProps> = ({
    projectUuid,
    value,
    onChange,
}) => {
    const { data: spaces = [], isLoading: isLoadingSpaces } = useSpaceSummaries(
        projectUuid,
        true,
    );
    const [isExpanded, setIsExpanded] = useState(false);

    if (isLoadingSpaces) {
        return (
            <Stack gap={4}>
                <Text fz="sm" fw={500}>
                    Space access
                </Text>
                <Text fz="xs" c="dimmed">
                    Loading spaces...
                </Text>
            </Stack>
        );
    }

    return (
        <Stack gap="xs">
            <Box>
                <Group gap="xs" mb={4}>
                    <Text fz="sm" fw={500}>
                        Space access
                    </Text>
                </Group>
                <Text fz="xs" c="dimmed" mb="xs">
                    Select specific spaces to restrict access. Empty selection =
                    access to all spaces.
                </Text>

                <Paper
                    withBorder
                    p="xs"
                    onClick={() =>
                        !isLoadingSpaces && setIsExpanded(!isExpanded)
                    }
                    className={
                        isLoadingSpaces
                            ? classes.selectTriggerDisabled
                            : classes.selectTrigger
                    }
                >
                    <Group justify="space-between">
                        <Text
                            fz="sm"
                            c={value.length === 0 ? 'dimmed' : undefined}
                        >
                            {isLoadingSpaces
                                ? 'Loading spaces...'
                                : value.length === 0
                                ? 'All spaces (click to restrict)'
                                : `${value.length} of ${spaces.length} space${
                                      spaces.length !== 1 ? 's' : ''
                                  } selected`}
                        </Text>
                        <MantineIcon
                            icon={IconChevronDown}
                            size={16}
                            className={`${classes.chevron} ${
                                isExpanded
                                    ? classes.chevronExpanded
                                    : classes.chevronCollapsed
                            }`}
                        />
                    </Group>
                </Paper>

                <Collapse in={isExpanded && !isLoadingSpaces}>
                    <Paper withBorder mt="xs" p="sm">
                        <Stack gap="sm">
                            {value.length > 0 && (
                                <Group justify="space-between">
                                    <Text fz="xs" c="dimmed">
                                        {value.length} space
                                        {value.length !== 1 ? 's' : ''} selected
                                    </Text>
                                    <Button
                                        variant="subtle"
                                        size="xs"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconX}
                                                size={14}
                                            />
                                        }
                                        onClick={() => onChange([])}
                                    >
                                        Clear selection
                                    </Button>
                                </Group>
                            )}

                            <Box className={classes.treeContainer}>
                                {spaces.length === 0 ? (
                                    <Text
                                        fz="sm"
                                        c="dimmed"
                                        ta="center"
                                        py="md"
                                    >
                                        No spaces found
                                    </Text>
                                ) : (
                                    <Tree
                                        type="multiple"
                                        topLevelLabel="All spaces"
                                        isExpanded={isExpanded}
                                        data={spaces}
                                        values={value}
                                        onChangeMultiple={onChange}
                                        withRootSelectable={true}
                                    />
                                )}
                            </Box>
                        </Stack>
                    </Paper>
                </Collapse>
            </Box>
        </Stack>
    );
};
