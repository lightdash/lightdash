import { Box, ActionIcon, Button, Group, Text, Tooltip } from '@mantine/core';
import { IconArrowLeft, IconCalendar } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import filterClasses from '../dashboardFilters/ActiveFilters/Filter.module.css';
import { NO_TILES_REASON } from './dateZoomControls';
import { formatTilesOf } from './fieldLabels';
import { focusOnMount, mappingRowMarker } from './mappingFocus';
import classes from './MappingRow.module.css';
import { useDateZoomEditorSelector } from './useDateZoomEditor';
import { useDateZoomMapping, type DateZoomMapping } from './useDateZoomMapping';

const MappingRowContent: FC<{ mapping: DateZoomMapping }> = ({ mapping }) => {
    const getUiString = useUiStrings();
    const endMapping = useDateZoomEditorSelector((c) => c.endMapping);
    const cancelMapping = useDateZoomEditorSelector((c) => c.cancelMapping);
    const apply = useDateZoomEditorSelector((c) => c.apply);
    const total = mapping.takeableTileUuids.length;
    const format = (count: number) => {
        const tilesOf = formatTilesOf(getUiString, count, total);
        return `${tilesOf.count} ${tilesOf.noun}`;
    };
    const applied = mapping.setTileUuids.length;
    const applyBlockedReason = applied > 0 ? null : NO_TILES_REASON;

    return (
        <>
            <Tooltip fz="xs" label="Back to date zoom">
                <ActionIcon
                    variant="subtle"
                    size="sm"
                    aria-label="Back to date zoom"
                    onClick={endMapping}
                >
                    <MantineIcon icon={IconArrowLeft} />
                </ActionIcon>
            </Tooltip>
            {/* The open pill names the zoom; it does nothing here */}
            <Box inert className={classes.pill}>
                <Button
                    size="xs"
                    variant="default"
                    data-open
                    data-in-effect
                    classNames={{ label: filterClasses.label }}
                    className={`${filterClasses.button} ${filterClasses.plain}`}
                    leftSection={
                        <MantineIcon
                            icon={IconCalendar}
                            size="sm"
                            className={filterClasses.statusIcon}
                        />
                    }
                >
                    <Text span fz="xs" fw={600}>
                        {mapping.name}
                    </Text>
                </Button>
            </Box>
            {/* One sentence: "[pill] zooms 4 of 6 tiles" */}
            <Text fz="sm" className={classes.words}>
                zooms
            </Text>
            <Text
                fz="sm"
                fw={600}
                className={classes.summary}
                data-reserve={format(total)}
                aria-live="polite"
            >
                <span>{format(applied)}</span>
            </Text>
            <Group gap="xs" wrap="nowrap" className={classes.actions}>
                <Button variant="default" size="xs" onClick={cancelMapping}>
                    {getUiString('filters.actions.cancel')}
                </Button>
                <Tooltip
                    fz="xs"
                    label={applyBlockedReason}
                    disabled={applyBlockedReason === null}
                >
                    <Box>
                        <Button
                            size="xs"
                            data-controls-apply
                            disabled={applyBlockedReason !== null}
                            onClick={apply}
                        >
                            {getUiString('filters.apply')}
                        </Button>
                    </Box>
                </Tooltip>
            </Group>
        </>
    );
};

// In the bar's place while a date zoom's tiles are chosen, as the
// parameter's mapping row: back, the open pill and its count
export const DateZoomMappingRow: FC = () => {
    const mapping = useDateZoomMapping();
    if (mapping === null) return null;
    return (
        <Group
            className={classes.row}
            gap="xs"
            tabIndex={-1}
            ref={focusOnMount}
            data-controls-editor
            {...mappingRowMarker}
        >
            <MappingRowContent mapping={mapping} />
        </Group>
    );
};
