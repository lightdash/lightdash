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
} from '@mantine/core';
import {
    IconArrowBack,
    IconFilter,
    IconSearch,
    IconTrash,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../common/MantineIcon';
import classes from './ValidatorTableTopToolbar.module.css';

const SOURCE_TYPE_OPTIONS = [
    { value: ValidationSourceType.Chart, labelKey: 'chart' },
    { value: ValidationSourceType.Dashboard, labelKey: 'dashboard' },
    { value: ValidationSourceType.DataApp, labelKey: 'dataApp' },
    { value: ValidationSourceType.Table, labelKey: 'table' },
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
    selectedCount: number;
    onDeleteSelected: () => void;
    onClearSelection: () => void;
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
    selectedCount,
    onDeleteSelected,
    onClearSelection,
}) => {
    const { t } = useTranslation('projectSettings');
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
                    placeholder={t('validator.toolbar.searchPlaceholder')}
                    leftSection={<MantineIcon icon={IconSearch} size={14} />}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.currentTarget.value)}
                    w={220}
                    classNames={{ input: classes.searchInput }}
                />

                <Popover width={250} position="bottom-start">
                    <Popover.Target>
                        <Tooltip
                            label={t('validator.toolbar.filterBySourceType')}
                        >
                            <Button
                                h={30}
                                c="foreground"
                                fz="xs"
                                variant="default"
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
                                {t('validator.toolbar.source')}
                            </Button>
                        </Tooltip>
                    </Popover.Target>
                    <Popover.Dropdown p="sm">
                        <Stack gap={4}>
                            <Text fz="xs" c="ldDark.3" fw={600}>
                                {t('validator.toolbar.filterBySource')}
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
                                            label={t(
                                                `validator.sourceTypes.${option.labelKey}`,
                                            )}
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
                        <Tooltip label={t('validator.toolbar.includeWarnings')}>
                            <Box c="dimmed">
                                {t('validator.toolbar.warnings')}
                            </Box>
                        </Tooltip>
                    }
                    size="xs"
                    classNames={{ label: classes.switchLabel }}
                />

                {hasActiveFilters && (
                    <Tooltip label={t('validator.toolbar.resetFilters')}>
                        <ActionIcon size="sm" onClick={resetFilters}>
                            <MantineIcon icon={IconArrowBack} />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Group>

            <Group gap="md" wrap="nowrap">
                {selectedCount > 0 && (
                    <Group gap="xs" wrap="nowrap">
                        <Button
                            size="compact-xs"
                            color="red"
                            variant="light"
                            leftSection={
                                <MantineIcon icon={IconTrash} size="sm" />
                            }
                            onClick={onDeleteSelected}
                        >
                            {t('validator.toolbar.deleteContent', {
                                count: selectedCount,
                            })}
                        </Button>
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            color="gray"
                            onClick={onClearSelection}
                        >
                            {t('validator.toolbar.clear')}
                        </Button>
                    </Group>
                )}
                {lastValidatedAt && (
                    <Text fw={500} fz="xs" c="dimmed">
                        {t('validator.toolbar.lastValidated', {
                            time: formatTime(lastValidatedAt),
                        })}
                    </Text>
                )}
                {totalResults > 0 && (
                    <Badge color="red" size="sm">
                        {t('validator.counts.errors', { count: totalResults })}
                    </Badge>
                )}
            </Group>
        </Group>
    );
};
