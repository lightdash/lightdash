import { getAppDisplayName, type DataAppViz } from '@lightdash/common';
import {
    Badge,
    Box,
    CloseButton,
    Combobox,
    Group,
    InputBase,
    Loader,
    ScrollArea,
    Text,
    useCombobox,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconPlus, IconPuzzle } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { type DataAppVizDraftOption } from '../../../features/apps/dataAppVizDraft';
import { useDataAppVisualizations } from '../../../features/apps/hooks/useDataAppVisualizations';
import MantineIcon from '../../common/MantineIcon';
import {
    BUILT_IN_GROUP,
    BUILT_IN_VEGA_DESCRIPTION,
    BUILT_IN_VEGA_LABEL,
    fromOptionValue,
    PROJECT_GROUP,
    toOptionValue,
    type CustomChartTypeOption,
} from './customChartTypeOption';

type Props = {
    projectUuid: string;
    /** What the chart is on now: Vega, one of the project's types, or nothing
     *  yet while a new type is being described. */
    selected: CustomChartTypeOption | null;
    /** The selected project type, so its label survives a filtered page. */
    selectedDataAppViz: DataAppViz | null;
    disabled: boolean;
    /** A build in flight, listed under Project until it lands. */
    draft: DataAppVizDraftOption | null;
    onSelectVega: () => void;
    /** Receives the whole viz so the caller can bind its contract without
     *  waiting on a fetch for the newly selected uuid. */
    onSelectProjectType: (dataAppViz: DataAppViz) => void;
    onSelectDraft: () => void;
    /** Clearing selects nothing, which is what asks for a new type. Null where
     *  that is not on offer, since landing there without the composer would
     *  strand the chart on no visualization at all. */
    onClear: (() => void) | null;
};

type CustomChartTypeItem = {
    value: string;
    label: string;
    description: string;
    isBuilding: boolean;
};

const DRAFT_LABEL = 'Untitled chart type';

/** Not a chart type: picking it clears the selection, and nothing selected is
 *  what puts the composer on screen. */
const CREATE_NEW_CHART_TYPE_OPTION_VALUE = '__create_new_chart_type__';
const CREATE_LABEL = 'Create new chart type';

const fieldSummary = (dataAppViz: DataAppViz): string => {
    const count = dataAppViz.schema?.fields.length ?? 0;
    return `${count} field${count === 1 ? '' : 's'}`;
};

const toItem = (dataAppViz: DataAppViz): CustomChartTypeItem => ({
    value: toOptionValue({
        kind: 'projectType',
        dataAppVizUuid: dataAppViz.dataAppVizUuid,
    }),
    label: getAppDisplayName(dataAppViz.name, dataAppViz.dataAppVizUuid),
    description: dataAppViz.description || fieldSummary(dataAppViz),
    isBuilding: false,
});

const VEGA_ITEM: CustomChartTypeItem = {
    value: toOptionValue({ kind: 'builtInVega' }),
    label: BUILT_IN_VEGA_LABEL,
    description: BUILT_IN_VEGA_DESCRIPTION,
    isBuilding: false,
};

const matchesSearch = (item: CustomChartTypeItem, search: string): boolean =>
    item.label.toLowerCase().includes(search.trim().toLowerCase());

/**
 * The one place a chart picks which custom chart type it is on: the built-in
 * Vega editor, or a reusable type from this project. Grouping them here is what
 * keeps the main chart type menu down to a single "Custom" entry, and what lets
 * a future custom chart source be added without renaming anything.
 *
 * Creating is offered as an action rather than a type: it clears the selection,
 * and nothing selected is what puts the composer on screen.
 *
 * Project search is server-side (debounced) so it scales past the first page;
 * the built-in group is filtered locally against the same term.
 */
const CustomChartTypePicker: FC<Props> = ({
    projectUuid,
    selected,
    selectedDataAppViz,
    disabled,
    draft,
    onSelectVega,
    onSelectProjectType,
    onSelectDraft,
    onClear,
}) => {
    const combobox = useCombobox({
        onDropdownClose: () => combobox.resetSelectedOption(),
    });
    // Null is "not searching", so the field shows what is selected. An empty
    // string is a search that has been cleared, which has to stay empty —
    // falling back to the label there is what made the text undeletable.
    const [search, setSearch] = useState<string | null>(null);

    const isOnDraft =
        draft !== null &&
        selected?.kind === 'projectType' &&
        selected.dataAppVizUuid === draft.dataAppVizUuid;

    // A build in flight has no visualization to name yet, so the draft names
    // itself — otherwise the field falls back to its placeholder and reads as
    // though nothing is happening.
    const selectedLabel = isOnDraft
        ? DRAFT_LABEL
        : selected === null
          ? null
          : selected.kind === 'builtInVega'
            ? BUILT_IN_VEGA_LABEL
            : selectedDataAppViz
              ? getAppDisplayName(
                    selectedDataAppViz.name,
                    selectedDataAppViz.dataAppVizUuid,
                )
              : null;
    // The selected label is shown by the input rather than held in `search`, so
    // an empty search means the whole list, not a query for the current label.
    const [debouncedSearch] = useDebouncedValue(search ?? '', 300);

    const { data, isInitialLoading, isFetching, error } =
        useDataAppVisualizations(projectUuid, debouncedSearch);

    // Keep the fetched rows addressable so submitting an option can hand the
    // caller the whole viz (contract included), not just its uuid.
    const dataAppVizsByUuid = useMemo(() => {
        const byUuid = new Map<string, DataAppViz>();
        if (selectedDataAppViz) {
            byUuid.set(selectedDataAppViz.dataAppVizUuid, selectedDataAppViz);
        }
        for (const page of data?.pages ?? []) {
            for (const viz of page.data) byUuid.set(viz.dataAppVizUuid, viz);
        }
        return byUuid;
    }, [data?.pages, selectedDataAppViz]);

    const projectItems = useMemo(() => {
        const dataAppVizs = data?.pages.flatMap((page) => page.data) ?? [];
        const items = dataAppVizs.map(toItem);
        // Keep the current selection displayable even when it is not in the
        // active (filtered) page.
        if (
            selectedDataAppViz &&
            !items.some(
                (i) =>
                    i.value ===
                    toOptionValue({
                        kind: 'projectType',
                        dataAppVizUuid: selectedDataAppViz.dataAppVizUuid,
                    }),
            )
        ) {
            items.unshift(toItem(selectedDataAppViz));
        }
        if (draft) {
            items.unshift({
                value: toOptionValue({
                    kind: 'projectType',
                    dataAppVizUuid: draft.dataAppVizUuid,
                }),
                label: DRAFT_LABEL,
                description: 'Building… available when ready',
                isBuilding: true,
            });
        }
        return items;
    }, [data?.pages, selectedDataAppViz, draft]);

    const builtInItems = matchesSearch(VEGA_ITEM, debouncedSearch)
        ? [VEGA_ITEM]
        : [];
    const hasOptions = builtInItems.length > 0 || projectItems.length > 0;

    const handleSubmit = (value: string) => {
        combobox.closeDropdown();
        // Hand the input back to whatever ends up selected, rather than leaving
        // the query that found it sitting there.
        setSearch(null);
        if (value === CREATE_NEW_CHART_TYPE_OPTION_VALUE) {
            onClear?.();
            return;
        }
        const option = fromOptionValue(value);
        if (!option) return;
        if (option.kind === 'builtInVega') {
            onSelectVega();
            return;
        }
        if (option.dataAppVizUuid === draft?.dataAppVizUuid) {
            onSelectDraft();
            return;
        }
        const picked = dataAppVizsByUuid.get(option.dataAppVizUuid);
        if (picked) onSelectProjectType(picked);
    };

    const renderItem = (item: CustomChartTypeItem) => (
        <Combobox.Option
            key={item.value}
            value={item.value}
            active={item.value === (selected ? toOptionValue(selected) : null)}
        >
            <Box>
                <Group gap="xs" wrap="nowrap">
                    <Text size="sm">{item.label}</Text>
                    {item.isBuilding && (
                        <Badge size="xs" variant="light" radius="sm">
                            Building
                        </Badge>
                    )}
                </Group>
                <Text size="xs" c="dimmed" lineClamp={2}>
                    {item.description}
                </Text>
            </Box>
        </Combobox.Option>
    );

    const isClearable = onClear !== null && selected !== null && !disabled;

    const decoration = isOnDraft ? (
        <Badge size="xs" variant="light" radius="sm">
            Building
        </Badge>
    ) : isFetching && !isInitialLoading ? (
        <Loader size={14} />
    ) : isClearable ? (
        <CloseButton
            size="sm"
            variant="transparent"
            aria-label="Clear custom chart type"
            // The input's blur would close the dropdown and swallow the click.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
                setSearch(null);
                combobox.closeDropdown();
                onClear();
            }}
        />
    ) : (
        <Combobox.Chevron />
    );

    return (
        <Combobox store={combobox} onOptionSubmit={handleSubmit}>
            <Combobox.Target targetType="input">
                <InputBase
                    disabled={disabled}
                    value={search === null ? (selectedLabel ?? '') : search}
                    placeholder="Search custom chart types…"
                    leftSection={<MantineIcon icon={IconPuzzle} />}
                    rightSection={decoration}
                    // The default section is sized for an icon, which clips the
                    // badge to "Bu…".
                    rightSectionWidth={isOnDraft ? 70 : undefined}
                    rightSectionPointerEvents={isClearable ? 'auto' : 'none'}
                    onChange={(event) => {
                        setSearch(event.currentTarget.value);
                        combobox.openDropdown();
                        combobox.resetSelectedOption();
                    }}
                    onFocus={() => combobox.openDropdown()}
                    onBlur={() => {
                        combobox.closeDropdown();
                        setSearch(null);
                    }}
                    onClick={() => combobox.openDropdown()}
                />
            </Combobox.Target>

            <Combobox.Dropdown hidden={disabled}>
                <Combobox.Options>
                    <ScrollArea.Autosize mah={250} type="scroll">
                        {builtInItems.length > 0 && (
                            <Combobox.Group label={BUILT_IN_GROUP}>
                                {builtInItems.map(renderItem)}
                            </Combobox.Group>
                        )}
                        {projectItems.length > 0 && (
                            <Combobox.Group label={PROJECT_GROUP}>
                                {projectItems.map(renderItem)}
                            </Combobox.Group>
                        )}
                        {!hasOptions && (
                            <Combobox.Empty>
                                {error
                                    ? 'Failed to load custom chart types'
                                    : 'No custom chart types match your search'}
                            </Combobox.Empty>
                        )}
                    </ScrollArea.Autosize>

                    {/* Pinned below the list: an action, not a chart type, and
                        finding nothing is exactly when it is wanted. */}
                    {onClear !== null && (
                        <Combobox.Footer>
                            <Combobox.Option
                                value={CREATE_NEW_CHART_TYPE_OPTION_VALUE}
                            >
                                <Group gap="xs" wrap="nowrap">
                                    <MantineIcon icon={IconPlus} />
                                    <Text size="sm" truncate="end">
                                        {CREATE_LABEL}
                                    </Text>
                                </Group>
                            </Combobox.Option>
                        </Combobox.Footer>
                    )}
                </Combobox.Options>
            </Combobox.Dropdown>
        </Combobox>
    );
};

export default CustomChartTypePicker;
