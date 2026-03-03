import { ValidationSourceType } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Checkbox,
    Group,
    Popover,
    ScrollArea,
    Stack,
    Switch,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { IconArrowBack, IconFilter, IconSearch } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import classes from './ValidatorTableTopToolbar.module.css';

const SOURCE_TYPE_OPTIONS = [
    { value: ValidationSourceType.Chart, label: 'Chart' },
    { value: ValidationSourceType.Dashboard, label: 'Dashboard' },
    { value: ValidationSourceType.Table, label: 'Table' },
] as const;

type ValidatorTableTopToolbarProps = {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    sourceTypeFilter: ValidationSourceType[];
    setSourceTypeFilter: (types: ValidationSourceType[]) => void;
    showConfigWarnings: boolean;
    setShowConfigWarnings: (show: boolean) => void;
    totalResults: number;
    lastValidatedAt: Date | null;
    isFetching: boolean;
};

export const ValidatorTableTopToolbar: FC<ValidatorTableTopToolbarProps> = ({
    searchQuery,
    setSearchQuery,
    sourceTypeFilter,
    setSourceTypeFilter,
    showConfigWarnings,
    setShowConfigWarnings,
    totalResults,
    lastValidatedAt,
}) => {
    const hasActiveFilters =
        sourceTypeFilter.length > 0 || showConfigWarnings || searchQuery !== '';

    const resetFilters = () => {
        setSourceTypeFilter([]);
        setShowConfigWarnings(false);
        setSearchQuery('');
    };

    const handleSourceChange = (value: string) => {
        const source = value as ValidationSourceType;
        if (sourceTypeFilter.includes(source)) {
            setSourceTypeFilter(sourceTypeFilter.filter((s) => s !== source));
        } else {
            setSourceTypeFilter([...sourceTypeFilter, source]);
        }
    };

    const formatTime = (date: Date) => {
        return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    };

    return (
        <Group
            justify="space-between"
            px="sm"
            py="md"
            wrap="nowrap"
            className={classes.toolbar}
        >
            <Group gap="sm" wrap="nowrap">
                <MantineIcon icon={IconFilter} color="ldGray" />

                <TextInput
                    size="xs"
                    placeholder="Search by name or error..."
                    leftSection={<MantineIcon icon={IconSearch} size={14} />}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.currentTarget.value)}
                    w={220}
                    classNames={{ input: classes.searchInput }}
                />

                <Popover width={250} position="bottom-start">
                    <Popover.Target>
                        <Tooltip
                            withinPortal
                            variant="xs"
                            label="Filter by source type"
                        >
                            <Button
                                h={30}
                                c="foreground"
                                fw={500}
                                fz="xs"
                                variant="default"
                                radius="md"
                                px="sm"
                                className={
                                    sourceTypeFilter.length > 0
                                        ? classes.filterButtonSelected
                                        : classes.filterButton
                                }
                                rightSection={
                                    sourceTypeFilter.length > 0 ? (
                                        <Badge
                                            size="xs"
                                            variant="filled"
                                            color="indigo.6"
                                            circle
                                        >
                                            {sourceTypeFilter.length}
                                        </Badge>
                                    ) : null
                                }
                            >
                                Source
                            </Button>
                        </Tooltip>
                    </Popover.Target>
                    <Popover.Dropdown p="sm">
                        <Stack gap={4}>
                            <Text fz="xs" c="ldDark.3" fw={600}>
                                Filter by source:
                            </Text>

                            <ScrollArea.Autosize
                                mah={200}
                                type="always"
                                scrollbars="y"
                            >
                                <Stack gap="xs">
                                    {SOURCE_TYPE_OPTIONS.map((option) => (
                                        <Checkbox
                                            key={option.value}
                                            checked={sourceTypeFilter.includes(
                                                option.value,
                                            )}
                                            onChange={() =>
                                                handleSourceChange(option.value)
                                            }
                                            label={option.label}
                                            size="xs"
                                        />
                                    ))}
                                </Stack>
                            </ScrollArea.Autosize>
                        </Stack>
                    </Popover.Dropdown>
                </Popover>

                <Switch
                    checked={showConfigWarnings}
                    onChange={(e) =>
                        setShowConfigWarnings(e.currentTarget.checked)
                    }
                    label={
                        <Tooltip label="Include chart configuration warnings">
                            <Box c="ldGray.6">Warnings</Box>
                        </Tooltip>
                    }
                    size="xs"
                    classNames={{ label: classes.switchLabel }}
                />

                {hasActiveFilters && (
                    <Tooltip label="Reset filters">
                        <ActionIcon
                            variant="subtle"
                            size="sm"
                            color="gray"
                            onClick={resetFilters}
                        >
                            <MantineIcon icon={IconArrowBack} />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Group>

            <Group gap="md" wrap="nowrap">
                {lastValidatedAt && (
                    <Text fw={500} fz="xs" c="ldGray.6">
                        Last validated: {formatTime(lastValidatedAt)}
                    </Text>
                )}
                {totalResults > 0 && (
                    <Badge variant="light" color="red" size="sm">
                        {totalResults} error{totalResults === 1 ? '' : 's'}
                    </Badge>
                )}
            </Group>
        </Group>
    );
};
