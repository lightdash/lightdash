import {
    type DashboardFilterableField,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Combobox,
    Group,
    InputBase,
    Menu,
    Text,
    Tooltip,
    useCombobox,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconAdjustmentsHorizontal,
    IconArrowLeft,
    IconCalendarSearch,
    IconFilter,
    IconSearch,
    type Icon,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import FilterFieldSelect from '../dashboardFilters/FilterConfiguration/FilterFieldSelect';
import {
    getCollidingFieldIds,
    getFieldOptionValue,
} from '../dashboardFilters/FilterConfiguration/FilterFieldSelect/useFilterFieldSections';
import {
    VirtualOptionList,
    type VirtualOptionItem,
    type VirtualOptionRow,
} from '../dashboardFilters/FilterConfiguration/FilterFieldSelect/VirtualOptionList';
import { formatTileCount } from './fieldLabels';
import { getParameterLabel } from './parameterControlsBar';
import {
    getParameterGroup,
    getParameterName,
    type ParameterOption,
} from './parameterOptions';

export const PickerBack: FC<{ onBack: () => void }> = ({ onBack }) => (
    <Tooltip fz="xs" label="Back">
        <ActionIcon size="sm" aria-label="Back" onClick={onBack}>
            <MantineIcon icon={IconArrowLeft} />
        </ActionIcon>
    </Tooltip>
);

const KindItem: FC<{
    icon: Icon;
    label: string;
    helper: string;
    onClick: () => void;
}> = ({ icon, label, helper, onClick }) => (
    <Menu.Item
        leftSection={<MantineIcon icon={icon} size={16} />}
        onClick={onClick}
    >
        <Text fz="sm" fw={500}>
            {label}
        </Text>
        <Text fz="xs" c="dimmed">
            {helper}
        </Text>
    </Menu.Item>
);

/** "Add"'s first step, inside its `Menu.Dropdown`: a filter, a parameter or a date zoom; null leaves a kind out. */
export const AddKindItems: FC<{
    onFilter: () => void;
    onParameter: (() => void) | null;
    onDateZoom: (() => void) | null;
}> = ({ onFilter, onParameter, onDateZoom }) => (
    <>
        <KindItem
            icon={IconFilter}
            label="Filter"
            helper="Narrow the data in tiles by a field"
            onClick={onFilter}
        />
        {onParameter !== null && (
            <KindItem
                icon={IconAdjustmentsHorizontal}
                label="Parameter"
                helper="Set a value that tiles use"
                onClick={onParameter}
            />
        )}
        {onDateZoom !== null && (
            <KindItem
                icon={IconCalendarSearch}
                label="Date zoom"
                helper="Change the date grain of some tiles"
                onClick={onDateZoom}
            />
        )}
    </>
);

type FieldPickerProps = {
    fields: DashboardFilterableField[];
    availableTileFilters: Record<string, DashboardFilterableField[]>;
    tiles: DashboardTile[];
    tabs: DashboardTab[];
    activeTabUuid: string | undefined;
    /** Back to the Filter or Parameter choice; null when there is none. */
    onBack: (() => void) | null;
    withinPortal: boolean;
    isViewer?: boolean;
    onPick: (field: DashboardFilterableField) => void;
};

// The shipped field picker, opened, each row counting the tiles it can filter
export const FieldPicker: FC<FieldPickerProps> = ({
    fields,
    availableTileFilters,
    tiles,
    tabs,
    activeTabUuid,
    onBack,
    withinPortal,
    isViewer = false,
    onPick,
}) => {
    const getUiString = useUiStrings();
    const tileCounts = useMemo(() => {
        const colliding = getCollidingFieldIds(fields);
        const counts = new Map<string, number>();
        Object.values(availableTileFilters).forEach((tileFields) =>
            new Set(
                tileFields.map((field) =>
                    getFieldOptionValue(field, colliding),
                ),
            ).forEach((value) =>
                counts.set(value, (counts.get(value) ?? 0) + 1),
            ),
        );
        return { colliding, counts };
    }, [fields, availableTileFilters]);
    const getHint = useCallback(
        (field: DashboardFilterableField) =>
            formatTileCount(
                getUiString,
                tileCounts.counts.get(
                    getFieldOptionValue(field, tileCounts.colliding),
                ) ?? 0,
            ),
        [getUiString, tileCounts],
    );
    return (
        <Group gap="xs" wrap="nowrap" data-controls-start>
            {onBack !== null && <PickerBack onBack={onBack} />}
            <Box flex={1}>
                <FilterFieldSelect
                    fields={fields}
                    availableTileFilters={availableTileFilters}
                    tiles={tiles}
                    tabs={tabs}
                    activeTabUuid={activeTabUuid}
                    selectedField={undefined}
                    withLabel={false}
                    placeholder={getUiString('controls.searchFields')}
                    withinPortal={withinPortal}
                    defaultOpened
                    isPickerSearch
                    getRowHint={isViewer ? undefined : getHint}
                    isFirstMatchSelected={!isViewer}
                    onChange={onPick}
                />
            </Box>
        </Group>
    );
};

const SEARCH_PARAMETERS = 'Search parameters';

type ParameterPickerProps = {
    parameters: ParameterOption[];
    onBack: () => void;
    withinPortal: boolean;
    onPick: (parameter: ParameterOption) => void;
};

// The field picker's rows for parameters: grouped by model, the project's
// first; search matches the model and the label ("pay" finds Payments Region)
export const ParameterPicker: FC<ParameterPickerProps> = ({
    parameters,
    onBack,
    withinPortal,
    onPick,
}) => {
    const getUiString = useUiStrings();
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 150);
    const combobox = useCombobox({ defaultOpened: true });
    const { selectFirstOption } = combobox;

    const items = useMemo((): VirtualOptionItem<ParameterOption>[] => {
        const query = debouncedSearch.trim().toLowerCase();
        const matches = parameters
            .filter((parameter) =>
                getParameterName(parameter).toLowerCase().includes(query),
            )
            .sort(
                (a, b) =>
                    Number(a.source.type !== 'project') -
                        Number(b.source.type !== 'project') ||
                    getParameterGroup(a).label.localeCompare(
                        getParameterGroup(b).label,
                    ) ||
                    getParameterLabel(a).localeCompare(getParameterLabel(b)),
            );
        // Grouped by source, so two models sharing a label stay apart
        const groupKeys = [
            ...new Set(matches.map((option) => getParameterGroup(option).key)),
        ];
        return groupKeys.flatMap(
            (groupKey): VirtualOptionItem<ParameterOption>[] => {
                const rows = matches.filter(
                    (option) => getParameterGroup(option).key === groupKey,
                );
                const label = getParameterGroup(rows[0]).label;
                return [
                    { type: 'group-header', label, dimmed: false },
                    ...rows.map(
                        (option): VirtualOptionItem<ParameterOption> => ({
                            type: 'option',
                            value: option.key,
                            data: option,
                            groupLabel: label,
                            dimmed: false,
                        }),
                    ),
                ];
            },
        );
    }, [parameters, debouncedSearch]);

    const getRow = useCallback(
        (option: ParameterOption): VirtualOptionRow => ({
            icon: null,
            name: getParameterLabel(option),
            description: option.definition.description ?? null,
            hint: formatTileCount(getUiString, option.tileUuids.length),
        }),
        [getUiString],
    );

    return (
        <Group gap="xs" wrap="nowrap" data-controls-start>
            <PickerBack onBack={onBack} />
            <Box flex={1}>
                <Combobox
                    store={combobox}
                    withinPortal={withinPortal}
                    offset={2}
                    onOptionSubmit={(key) => {
                        const parameter = parameters.find(
                            (option) => option.key === key,
                        );
                        if (parameter) onPick(parameter);
                        combobox.closeDropdown();
                    }}
                >
                    <Combobox.Target>
                        <InputBase
                            radius="md"
                            size="xs"
                            value={search}
                            placeholder={SEARCH_PARAMETERS}
                            aria-label={SEARCH_PARAMETERS}
                            onChange={(event) => {
                                setSearch(event.currentTarget.value);
                                // Enter waits for the settled search's first match
                                combobox.resetSelectedOption();
                                combobox.openDropdown();
                            }}
                            onClick={() => combobox.openDropdown()}
                            onBlur={() => combobox.closeDropdown()}
                            leftSection={
                                <MantineIcon icon={IconSearch} color="dimmed" />
                            }
                            autoComplete="off"
                            data-autofocus
                        />
                    </Combobox.Target>
                    <Combobox.Dropdown p={0}>
                        <VirtualOptionList
                            items={items}
                            getRow={getRow}
                            selectedValue={null}
                            // Enter picks the first match, as in the field picker
                            onSelectFirst={selectFirstOption}
                            settledSearch={
                                search === debouncedSearch
                                    ? debouncedSearch
                                    : null
                            }
                            emptyText="No matching parameters"
                        />
                    </Combobox.Dropdown>
                </Combobox>
            </Box>
        </Group>
    );
};
