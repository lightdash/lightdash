import { getAppDisplayName, type DataAppViz } from '@lightdash/common';
import {
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
import {
    IconCode,
    IconLayoutGrid,
    IconPlus,
    IconPuzzle,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useDataAppVisualizations } from '../../../features/chartTypes/hooks/useDataAppVisualizations';
import { getChartTypeIcon } from '../../../features/chartTypes/utils/chartTypeIcons';
import MantineIcon from '../../common/MantineIcon';
import {
    fromOptionValue,
    toOptionValue,
    type CustomChartTypeOption,
} from './customChartTypeOption';

type Props = {
    projectUuid: string;
    /** What the chart is on now: Vega, one of the project's types, or nothing
     *  selected yet. */
    selected: CustomChartTypeOption | null;
    /** The selected project type, so its label survives a filtered page. */
    selectedDataAppViz: DataAppViz | null;
    disabled: boolean;
    /** Null hides the built-in Vega option. */
    onSelectVega: (() => void) | null;
    /** Receives the whole viz so the caller can bind its contract without
     *  waiting on a fetch for the newly selected uuid. */
    onSelectProjectType: (dataAppViz: DataAppViz) => void;
    /** Null where an empty selection is not a state the caller can be left in. */
    onClear: (() => void) | null;
    /** Opens the chart type builder; null hides the create action. */
    onCreateNew: (() => void) | null;
    /** Opens the chart type gallery; null hides the action. */
    onBrowseGallery: (() => void) | null;
};

type CustomChartTypeItem = {
    value: string;
    label: string;
    description: string;
    icon: TablerIcon;
};

const CREATE_NEW_CHART_TYPE_OPTION_VALUE = '__create_new_chart_type__';
const BROWSE_GALLERY_OPTION_VALUE = '__browse_gallery__';

const fieldSummary = (dataAppViz: DataAppViz, t: TFunction): string =>
    t('customChartType.fieldCount', {
        count: dataAppViz.schema?.fields.length ?? 0,
    });

const toItem = (dataAppViz: DataAppViz, t: TFunction): CustomChartTypeItem => ({
    value: toOptionValue({
        kind: 'projectType',
        dataAppVizUuid: dataAppViz.dataAppVizUuid,
    }),
    label: getAppDisplayName(dataAppViz.name, dataAppViz.dataAppVizUuid),
    description: dataAppViz.description || fieldSummary(dataAppViz, t),
    icon: getChartTypeIcon(dataAppViz.icon),
});

const getVegaItem = (t: TFunction): CustomChartTypeItem => ({
    value: toOptionValue({ kind: 'builtInVega' }),
    label: t('customChartType.builtInVegaLabel'),
    description: t('customChartType.builtInVegaDescription'),
    icon: IconCode,
});

const matchesSearch = (item: CustomChartTypeItem, search: string): boolean =>
    item.label.toLowerCase().includes(search.trim().toLowerCase());

/**
 * The one place a chart picks which custom chart type it is on: the built-in
 * Vega editor, or a reusable type from this project. Grouping them here is what
 * keeps the main chart type menu down to a single "Custom" entry, and what lets
 * a future custom chart source be added without renaming anything.
 *
 * Project search is server-side (debounced) so it scales past the first page;
 * the built-in group is filtered locally against the same term.
 */
const CustomChartTypePicker: FC<Props> = ({
    projectUuid,
    selected,
    selectedDataAppViz,
    disabled,
    onSelectVega,
    onSelectProjectType,
    onClear,
    onCreateNew,
    onBrowseGallery,
}) => {
    const { t } = useTranslation('vizConfig');
    const vegaItem = useMemo(() => getVegaItem(t), [t]);
    const combobox = useCombobox({
        onDropdownClose: () => combobox.resetSelectedOption(),
    });
    // Null is "not searching", so the field shows what is selected. An empty
    // string is a search that has been cleared, which has to stay empty —
    // falling back to the label there is what made the text undeletable.
    const [search, setSearch] = useState<string | null>(null);

    const selectedLabel =
        selected === null
            ? null
            : selected.kind === 'builtInVega'
              ? vegaItem.label
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
        const items = dataAppVizs.map((viz) => toItem(viz, t));
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
            items.unshift(toItem(selectedDataAppViz, t));
        }
        return items;
    }, [data?.pages, selectedDataAppViz, t]);

    const builtInItems =
        onSelectVega !== null && matchesSearch(vegaItem, debouncedSearch)
            ? [vegaItem]
            : [];
    const hasOptions = builtInItems.length > 0 || projectItems.length > 0;

    const handleSubmit = (value: string) => {
        combobox.closeDropdown();
        // Hand the input back to whatever ends up selected, rather than leaving
        // the query that found it sitting there.
        setSearch(null);
        if (value === CREATE_NEW_CHART_TYPE_OPTION_VALUE) {
            onCreateNew?.();
            return;
        }
        if (value === BROWSE_GALLERY_OPTION_VALUE) {
            onBrowseGallery?.();
            return;
        }
        const option = fromOptionValue(value);
        if (!option) return;
        if (option.kind === 'builtInVega') {
            onSelectVega?.();
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
            <Group gap="xs" wrap="nowrap">
                <MantineIcon icon={item.icon} />
                <Box>
                    <Text size="sm">{item.label}</Text>
                    <Text size="xs" c="dimmed" lineClamp={2}>
                        {item.description}
                    </Text>
                </Box>
            </Group>
        </Combobox.Option>
    );

    const isClearable = onClear !== null && selected !== null && !disabled;

    // Puzzle piece by default (nothing selected, or the project type's icon
    // hasn't loaded yet); otherwise the selected type's own icon.
    const selectedIcon =
        selected === null
            ? IconPuzzle
            : selected.kind === 'builtInVega'
              ? IconCode
              : getChartTypeIcon(selectedDataAppViz?.icon ?? null);

    const decoration =
        isFetching && !isInitialLoading ? (
            <Loader size={14} />
        ) : isClearable ? (
            <CloseButton
                size="sm"
                variant="transparent"
                aria-label={t('customChartType.clear')}
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
                    placeholder={t('customChartType.searchPlaceholder')}
                    leftSection={<MantineIcon icon={selectedIcon} />}
                    rightSection={decoration}
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
                            <Combobox.Group
                                label={t('customChartType.builtInGroup')}
                            >
                                {builtInItems.map(renderItem)}
                            </Combobox.Group>
                        )}
                        {projectItems.length > 0 && (
                            <Combobox.Group
                                label={t('customChartType.projectGroup')}
                            >
                                {projectItems.map(renderItem)}
                            </Combobox.Group>
                        )}
                        {!hasOptions && (
                            <Combobox.Empty>
                                {error
                                    ? t('customChartType.loadFailed')
                                    : t('customChartType.noMatches')}
                            </Combobox.Empty>
                        )}
                    </ScrollArea.Autosize>

                    {/* Actions, not chart types; wanted even when the search
                        finds nothing. */}
                    {(onCreateNew !== null || onBrowseGallery !== null) && (
                        <Combobox.Footer>
                            {onCreateNew !== null && (
                                <Combobox.Option
                                    value={CREATE_NEW_CHART_TYPE_OPTION_VALUE}
                                >
                                    <Group gap="xs" wrap="nowrap">
                                        <MantineIcon icon={IconPlus} />
                                        <Text size="sm" truncate="end">
                                            {t('customChartType.createNew')}
                                        </Text>
                                    </Group>
                                </Combobox.Option>
                            )}
                            {onBrowseGallery !== null && (
                                <Combobox.Option
                                    value={BROWSE_GALLERY_OPTION_VALUE}
                                >
                                    <Group gap="xs" wrap="nowrap">
                                        <MantineIcon icon={IconLayoutGrid} />
                                        <Text size="sm" truncate="end">
                                            {t('customChartType.browse')}
                                        </Text>
                                    </Group>
                                </Combobox.Option>
                            )}
                        </Combobox.Footer>
                    )}
                </Combobox.Options>
            </Combobox.Dropdown>
        </Combobox>
    );
};

export default CustomChartTypePicker;
