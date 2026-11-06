import { type LiveSourceField } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Checkbox,
    Divider,
    Group,
    SegmentedControl,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconSearch, IconTrash, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import classes from '../../../../ee/features/serviceAccounts/ServiceAccountsToolbar.module.css';
import FilterFacet from '../../../common/FilterFacet';
import MantineIcon from '../../../common/MantineIcon';
import {
    isFieldKind,
    isFieldsView,
    type FieldFilters,
    type FieldsView,
} from './liveSourceFieldsView';

const KIND_OPTIONS = [
    { value: 'dimension', label: 'Dimensions' },
    { value: 'metric', label: 'Metrics' },
] as const;

type Props = {
    filters: FieldFilters;
    onChange: (filters: FieldFilters) => void;
    onClear: () => void;
    hasActiveFilters: boolean;
    fields: LiveSourceField[];
    viewFields: LiveSourceField[];
    groups: string[];
    integrationLabel: string;
    internalFieldsHint: string | null;
};

const FieldsToolbar: FC<Props> = ({
    filters,
    onChange,
    onClear,
    hasActiveFilters,
    fields,
    viewFields,
    groups,
    integrationLabel,
    internalFieldsHint,
}) => {
    const inUseCount = fields.filter(({ inUse }) => inUse).length;
    const views: {
        value: FieldsView;
        label: string;
        tooltip: string | null;
    }[] = [
        { value: 'all', label: `All (${fields.length})`, tooltip: null },
        {
            value: 'inUse',
            label: `In use (${inUseCount})`,
            tooltip: 'Charts and AI agents can query these fields',
        },
        {
            value: 'available',
            label: `Available (${fields.length - inUseCount})`,
            tooltip: `Fields ${integrationLabel} offers that aren't in use yet`,
        },
    ];
    const hasInternalFields = fields.some(
        ({ inUse, isInternal }) => !inUse && isInternal,
    );
    const { search } = filters;

    return (
        <Group
            justify="space-between"
            py="sm"
            px="md"
            wrap="nowrap"
            className={classes.toolbar}
        >
            <Group gap="xs" wrap="nowrap" flex={1} miw={0}>
                <TextInput
                    size="xs"
                    type="search"
                    placeholder="Search fields..."
                    aria-label="Search fields"
                    value={search}
                    classNames={{
                        input: search
                            ? classes.searchInputWithValue
                            : classes.searchInput,
                    }}
                    leftSection={
                        <MantineIcon
                            size="md"
                            color="dimmed"
                            icon={IconSearch}
                        />
                    }
                    onChange={(event) =>
                        onChange({ ...filters, search: event.target.value })
                    }
                    rightSection={
                        search ? (
                            <ActionIcon
                                onClick={() =>
                                    onChange({ ...filters, search: '' })
                                }
                                variant="transparent"
                                size="xs"
                                color="ldGray.5"
                                aria-label="Clear search"
                            >
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        ) : null
                    }
                />

                <Divider orientation="vertical" w={1} h={20} />

                <SegmentedControl
                    size="xs"
                    value={filters.view}
                    onChange={(value) => {
                        if (isFieldsView(value)) {
                            onChange({ ...filters, view: value });
                        }
                    }}
                    classNames={{
                        root: classes.segmentedControl,
                        indicator: classes.segmentedIndicator,
                        label: classes.segmentedLabel,
                    }}
                    data={views.map(({ value, label, tooltip }) => ({
                        value,
                        label: (
                            <Tooltip label={tooltip} disabled={!tooltip}>
                                <Box>
                                    <Text fz="xs" fw={500}>
                                        {label}
                                    </Text>
                                </Box>
                            </Tooltip>
                        ),
                    }))}
                />

                <Divider orientation="vertical" w={1} h={20} />

                <FilterFacet
                    label="Type"
                    selected={filters.kinds}
                    onChange={(selected) =>
                        onChange({
                            ...filters,
                            kinds: selected.filter(isFieldKind),
                        })
                    }
                    options={KIND_OPTIONS.map((option) => ({
                        ...option,
                        count: viewFields.filter(
                            ({ kind }) => kind === option.value,
                        ).length,
                    }))}
                    clearable
                />
                {groups.length > 0 && (
                    <FilterFacet
                        label="Group"
                        selected={filters.groups}
                        onChange={(selected) =>
                            onChange({ ...filters, groups: selected })
                        }
                        options={groups.map((group) => ({
                            value: group,
                            label: group,
                            count: viewFields.filter(
                                (field) => field.group === group,
                            ).length,
                        }))}
                        clearable
                    />
                )}
                {filters.view !== 'inUse' && hasInternalFields && (
                    <>
                        <Divider orientation="vertical" w={1} h={20} />
                        <Tooltip
                            label={internalFieldsHint}
                            disabled={!internalFieldsHint}
                        >
                            <Box>
                                <Checkbox
                                    label="Show internal fields"
                                    size="xs"
                                    checked={filters.showInternal}
                                    classNames={{
                                        body: classes.checkboxBody,
                                        input: classes.checkboxInput,
                                        label: classes.checkboxLabel,
                                    }}
                                    onChange={(event) =>
                                        onChange({
                                            ...filters,
                                            showInternal:
                                                event.currentTarget.checked,
                                        })
                                    }
                                />
                            </Box>
                        </Tooltip>
                    </>
                )}
            </Group>

            {hasActiveFilters && (
                <Tooltip label="Clear all filters">
                    <ActionIcon
                        size="sm"
                        onClick={onClear}
                        aria-label="Clear all filters"
                    >
                        <MantineIcon icon={IconTrash} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
};

export default FieldsToolbar;
