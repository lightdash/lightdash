import {
    getDashboardFilterableFieldKey,
    interpolateUiString,
    type DashboardFilterableField,
} from '@lightdash/common';
import { Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { useFilterFieldSections } from '../dashboardFilters/FilterConfiguration/FilterFieldSelect/useFilterFieldSections';
import classes from './FieldsAndCharts.module.css';

const MAX_ROWS_PER_GROUP = 8;

type Props = {
    fields: DashboardFilterableField[];
    onPick: (field: DashboardFilterableField) => void;
    getSubLabel: (field: DashboardFilterableField) => string;
};

export const FieldPicker: FC<Props> = ({ fields, onPick, getSubLabel }) => {
    const getUiString = useUiStrings();
    const [search, setSearch] = useState('');
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const activeTab = useDashboardContext((c) => c.activeTab);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );

    const sections = useFilterFieldSections({
        fields,
        availableTileFilters: filterableFieldsByTileUuid ?? {},
        tiles: dashboardTiles ?? [],
        tabs: dashboardTabs,
        activeTabUuid: activeTab?.uuid,
        search,
    });

    const groups = sections
        .map((section) => ({
            label: section.label,
            fields: section.groups.flatMap((group) => group.fields),
        }))
        .filter((group) => group.fields.length > 0);

    return (
        <Stack gap="xs">
            <TextInput
                placeholder="Search fields"
                aria-label="Search fields"
                leftSection={<MantineIcon icon={IconSearch} />}
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
            />
            {groups.length === 0 && (
                <Text fz="xs" c="dimmed">
                    No fields to add
                </Text>
            )}
            {groups.map((group) => {
                const shown =
                    search === ''
                        ? group.fields.slice(0, MAX_ROWS_PER_GROUP)
                        : group.fields;
                const hiddenCount = group.fields.length - shown.length;
                return (
                    <Stack key={group.label} gap={0}>
                        {group.label !== '' && (
                            <Text fz="xs" fw={600} c="dimmed" px="xs">
                                {group.label}
                            </Text>
                        )}
                        {shown.map((field) => (
                            <UnstyledButton
                                key={getDashboardFilterableFieldKey(field)}
                                className={classes.option}
                                onClick={() => onPick(field)}
                            >
                                <Text fz="sm" truncate>
                                    {field.label}
                                </Text>
                                <Text fz="xs" c="dimmed" truncate>
                                    {getSubLabel(field)}
                                </Text>
                            </UnstyledButton>
                        ))}
                        {hiddenCount > 0 && (
                            <Text fz="xs" c="dimmed" px="xs">
                                {interpolateUiString(
                                    getUiString(
                                        'filters.config.moreFields.plural',
                                    ),
                                    { count: hiddenCount },
                                )}
                            </Text>
                        )}
                    </Stack>
                );
            })}
        </Stack>
    );
};
