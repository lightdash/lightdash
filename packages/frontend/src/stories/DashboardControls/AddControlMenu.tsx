import {
    getItemId,
    getItemLabelWithoutTableName,
    isField,
    type DashboardFilterableField,
    type DashboardTab,
    type DashboardTile,
    type UiStringResolver,
} from '@lightdash/common';
import { Button, Menu, Paper, Stack, Text } from '@mantine/core';
import {
    IconAdjustmentsHorizontal,
    IconFilter,
    IconPlus,
    type Icon,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { formatTileCount } from '../../features/dashboardControls/fieldLabels';
import {
    getCollidingFieldIds,
    getFieldOptionValue,
    useFilterFieldSections,
} from '../../features/dashboardFilters/FilterConfiguration/FilterFieldSelect/useFilterFieldSections';
import { ControlPicker, type PickerSection } from './ControlPicker';
import { CONTROL_STRINGS } from './controlStrings';
import { focusStartOnMount } from './focus';
import {
    getParameterGroup,
    getParameterLabel,
    getParameterName,
    type ParameterOption,
} from './parameterOptions';
import { usePickerSearch } from './usePickerSearch';

// "2 tiles", or "On the bar · 2 tiles": a hint, never a reason to disable,
// since a second control on the same field or parameter is allowed
const getRowHint = (
    getUiString: UiStringResolver,
    tileCount: number,
    isOnBar: boolean,
) => {
    const tiles = formatTileCount(getUiString, tileCount);
    return isOnBar ? `${CONTROL_STRINGS.onTheBar} · ${tiles}` : tiles;
};

type Step = 'closed' | 'choose' | 'filter' | 'parameter';

const KindItem: FC<{
    icon: Icon;
    label: string;
    helper: string;
    onClick: () => void;
}> = ({ icon, label, helper, onClick }) => (
    <Menu.Item leftSection={<MantineIcon icon={icon} />} onClick={onClick}>
        <Text fz="sm">{label}</Text>
        <Text fz="xs" c="dimmed">
            {helper}
        </Text>
    </Menu.Item>
);

// Fields through the shipped picker's sections, so search, order and the
// tab split match it; each row counts the tiles it can filter
const FieldPicker: FC<{
    fields: DashboardFilterableField[];
    tabs: DashboardTab[];
    tiles: DashboardTile[];
    availableTileFilters: Record<string, DashboardFilterableField[]>;
    onBarFieldIds: string[];
    onBack: (() => void) | null;
    onPick: (field: DashboardFilterableField) => void;
}> = ({
    fields,
    tabs,
    tiles,
    availableTileFilters,
    onBarFieldIds,
    onBack,
    onPick,
}) => {
    const getUiString = useUiStrings();
    const { input, setInput, search } = usePickerSearch();
    const fieldSections = useFilterFieldSections({
        fields,
        availableTileFilters,
        tiles,
        tabs,
        activeTabUuid: tabs[0]?.uuid,
        search,
    });
    const collidingFieldIds = useMemo(
        () => getCollidingFieldIds(fields),
        [fields],
    );
    const getValue = (field: DashboardFilterableField) =>
        getFieldOptionValue(field, collidingFieldIds);
    const tileCounts = useMemo(() => {
        const counts = new Map<string, number>();
        Object.values(availableTileFilters).forEach((tileFields) =>
            new Set(
                tileFields.map((field) =>
                    getFieldOptionValue(field, collidingFieldIds),
                ),
            ).forEach((value) =>
                counts.set(value, (counts.get(value) ?? 0) + 1),
            ),
        );
        return counts;
    }, [availableTileFilters, collidingFieldIds]);

    const sections: PickerSection[] = fieldSections.map((section) => ({
        // The hook labels sections only when it splits by tab
        key: section.label,
        label: section.label || null,
        dimmed: section.dimmed,
        groups: section.groups.map((group) => ({
            key: `${group.tableName}:${group.tableLabel}`,
            label: group.tableLabel,
            rows: group.fields.map((field) => ({
                value: getValue(field),
                icon: <FieldIcon item={field} size="md" />,
                description:
                    isField(field) && field.description
                        ? field.description
                        : null,
                name: getItemLabelWithoutTableName(field),
                hint: getRowHint(
                    getUiString,
                    tileCounts.get(getValue(field)) ?? 0,
                    onBarFieldIds.includes(getItemId(field)),
                ),
            })),
        })),
    }));

    return (
        <ControlPicker
            searchLabel={getUiString('controls.searchFields')}
            input={input}
            onInputChange={setInput}
            search={search}
            sections={sections}
            emptyText={getUiString('filters.config.noMatchingFields')}
            onBack={onBack}
            onPick={(value) => {
                const field = fields.find(
                    (candidate) => getValue(candidate) === value,
                );
                if (field) onPick(field);
            }}
        />
    );
};

// Parameters grouped by model, as fields are by table; search matches the
// model and the label ("pay" finds Payments Region)
const ParameterPicker: FC<{
    parameters: ParameterOption[];
    onBarParameterKeys: string[];
    onBack: () => void;
    onPick: (parameter: ParameterOption) => void;
}> = ({ parameters, onBarParameterKeys, onBack, onPick }) => {
    const getUiString = useUiStrings();
    const { input, setInput, search } = usePickerSearch();
    const query = search.trim().toLowerCase();
    const matches = parameters
        .filter((parameter) =>
            getParameterName(parameter).toLowerCase().includes(query),
        )
        // The project's parameters first, then each model's, by label
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
        ...new Set(
            matches.map((parameter) => getParameterGroup(parameter).key),
        ),
    ];

    return (
        <ControlPicker
            searchLabel={CONTROL_STRINGS.searchParameters}
            input={input}
            onInputChange={setInput}
            search={search}
            sections={[
                {
                    key: 'parameters',
                    label: null,
                    dimmed: false,
                    groups: groupKeys.map((groupKey) => {
                        const rows = matches.filter(
                            (parameter) =>
                                getParameterGroup(parameter).key === groupKey,
                        );
                        return {
                            key: groupKey,
                            label: rows[0]
                                ? getParameterGroup(rows[0]).label
                                : groupKey,
                            rows: rows.map((parameter) => ({
                                value: parameter.key,
                                icon: (
                                    <MantineIcon
                                        icon={IconAdjustmentsHorizontal}
                                        size="md"
                                        color="ldGray.6"
                                    />
                                ),
                                name: getParameterLabel(parameter),
                                description:
                                    parameter.definition.description ?? null,
                                hint: getRowHint(
                                    getUiString,
                                    new Set(parameter.tileUuids).size,
                                    onBarParameterKeys.includes(parameter.key),
                                ),
                            })),
                        };
                    }),
                },
            ]}
            emptyText={CONTROL_STRINGS.noMatchingParameters}
            onBack={onBack}
            onPick={(key) => {
                const parameter = parameters.find(
                    (option) => option.key === key,
                );
                if (parameter) onPick(parameter);
            }}
        />
    );
};

type Props = {
    fields: DashboardFilterableField[];
    tabs: DashboardTab[];
    tiles: DashboardTile[];
    /** The fields each tile can be filtered by: a field's tile count. */
    availableTileFilters: Record<string, DashboardFilterableField[]>;
    /** Fields a filter on the bar already uses: "On the bar", still pickable. */
    onBarFieldIds: string[];
    /** One row per parameter, never combined; empty leaves filters only. */
    parameters: ParameterOption[];
    /** Parameters a control already sets: "On the bar", still pickable. */
    onBarParameterKeys: string[];
    /** Viewers add filters only: "Add filter", straight to the field picker. */
    isViewer: boolean;
    onPickField: (field: DashboardFilterableField) => void;
    onPickParameter: (parameter: ParameterOption) => void;
};

// "Add": a choice of filter or parameter first, then one picker for either.
// Opens with the choice showing
export const AddControlMenu: FC<Props> = ({
    fields,
    tabs,
    tiles,
    availableTileFilters,
    onBarFieldIds,
    parameters,
    onBarParameterKeys,
    isViewer,
    onPickField,
    onPickParameter,
}) => {
    const getUiString = useUiStrings();
    // Filters only (a viewer, or no tile uses a parameter): no choice to make
    const isFilterOnly = isViewer || parameters.length === 0;
    const [step, setStep] = useState<Step>(isFilterOnly ? 'filter' : 'choose');
    const backToChoice = () => setStep('choose');

    const panel =
        step === 'filter' ? (
            <FieldPicker
                fields={fields}
                tabs={tabs}
                tiles={tiles}
                availableTileFilters={availableTileFilters}
                onBarFieldIds={onBarFieldIds}
                onBack={isFilterOnly ? null : backToChoice}
                onPick={onPickField}
            />
        ) : step === 'parameter' ? (
            <ParameterPicker
                parameters={parameters}
                onBarParameterKeys={onBarParameterKeys}
                onBack={backToChoice}
                onPick={onPickParameter}
            />
        ) : null;

    return (
        <Stack gap="xs" align="flex-start">
            {isFilterOnly ? (
                <Button
                    variant="default"
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={() => setStep('filter')}
                >
                    {getUiString('filters.addFilter')}
                </Button>
            ) : (
                <Menu
                    position="bottom-start"
                    width={280}
                    opened={step === 'choose'}
                    onChange={(opened) =>
                        setStep((current) =>
                            opened
                                ? 'choose'
                                : current === 'choose'
                                  ? 'closed'
                                  : current,
                        )
                    }
                >
                    <Menu.Target>
                        <Button
                            variant="default"
                            size="xs"
                            leftSection={<MantineIcon icon={IconPlus} />}
                        >
                            {getUiString('controls.add')}
                        </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <KindItem
                            icon={IconFilter}
                            label={CONTROL_STRINGS.kindFilter}
                            helper={CONTROL_STRINGS.kindFilterHelper}
                            onClick={() => setStep('filter')}
                        />
                        <KindItem
                            icon={IconAdjustmentsHorizontal}
                            label={CONTROL_STRINGS.kindParameter}
                            helper={CONTROL_STRINGS.kindParameterHelper}
                            onClick={() => setStep('parameter')}
                        />
                    </Menu.Dropdown>
                </Menu>
            )}
            {panel !== null && (
                <Paper
                    key={step}
                    shadow="md"
                    radius="md"
                    w="min(400px, calc(100vw - 56px))"
                    ref={focusStartOnMount}
                >
                    {panel}
                </Paper>
            )}
        </Stack>
    );
};
