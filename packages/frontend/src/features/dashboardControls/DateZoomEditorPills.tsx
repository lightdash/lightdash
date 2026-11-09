import {
    EMPTY_DATE_ZOOM_CONFIG,
    getControlActiveGranularity,
    type DateZoomControl,
} from '@lightdash/common';
import { Button, Group, Popover, Text } from '@mantine/core';
import { IconCalendar, IconEyeOff } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    selectAvailableCustomGranularities,
    selectControlGranularities,
    useDashboardDateZoomConfig,
    useDashboardSelector,
} from '../dashboard/store';
import filterClasses from '../dashboardFilters/ActiveFilters/Filter.module.css';
import dateZoomClasses from '../dateZoom/components/DateZoom.module.css';
import {
    useEligibleTiles,
    useGranularityData,
} from '../dateZoom/components/useDateZoomControlOptions';
import { getGranularityLabel } from '../dateZoom/utils';
import { InertWhileEditing } from './AddControl';
import { DateZoomControlPopover } from './DateZoomControlPopover';
import {
    DATE_ZOOM_ADD_ATTRIBUTE,
    DATE_ZOOM_PILL_ATTRIBUTE,
    getZoomTileUuids,
} from './dateZoomControls';
import editorClasses from './FilterEditor.module.css';
import parameterClasses from './ParameterPills.module.css';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useDateZoomEditorSelector } from './useDateZoomEditor';

const NO_TRANSITION = { duration: 0 };

// The open zoom's popover, wired to the provider, the only writer
const DateZoomEditorContent: FC = () => {
    const draft = useDateZoomEditorSelector((c) => c.draft);
    const draftConfig = useDateZoomEditorSelector((c) => c.draftConfig);
    const isNew = useDateZoomEditorSelector((c) => c.isNew);
    const isAsking = useDateZoomEditorSelector((c) => c.isAsking);
    const update = useDateZoomEditorSelector((c) => c.update);
    const apply = useDateZoomEditorSelector((c) => c.apply);
    const cancel = useDateZoomEditorSelector((c) => c.cancel);
    const remove = useDateZoomEditorSelector((c) => c.remove);
    const resolvePending = useDateZoomEditorSelector((c) => c.resolvePending);
    const granularityData = useGranularityData();
    const config = draftConfig ?? EMPTY_DATE_ZOOM_CONFIG;
    const eligibleTiles = useEligibleTiles(config, draft?.uuid ?? '');
    if (draft === null) return null;
    return (
        <DateZoomControlPopover
            control={draft}
            granularityData={granularityData}
            tileCount={getZoomTileUuids(config, draft.uuid).length}
            totalTileCount={eligibleTiles.length}
            isNew={isNew}
            isAsking={isAsking}
            onResolvePending={resolvePending}
            onChange={update}
            onCancel={cancel}
            onApply={apply}
            onRemove={remove}
            onChooseTiles={null}
        />
    );
};

// As the parameter editor's popover: focus kept inside, Escape and a press
// outside owned by the provider, mounted only while open
const DateZoomEditorPopover: FC<{ isOpen: boolean; children: ReactNode }> = ({
    isOpen,
    children,
}) => (
    <Popover
        opened={isOpen}
        // The zooms sit at the bar's right edge
        position="bottom-end"
        withArrow
        offset={1}
        arrowOffset={14}
        transitionProps={NO_TRANSITION}
        trapFocus
        closeOnEscape={false}
        closeOnClickOutside={false}
        withRoles={false}
    >
        <Popover.Target>{children}</Popover.Target>
        {isOpen && (
            <Popover.Dropdown
                p={0}
                tabIndex={-1}
                data-controls-editor
                className={editorClasses.dropdown}
            >
                <DateZoomEditorContent />
            </Popover.Dropdown>
        )}
    </Popover>
);

const DateZoomPill: FC<{ control: DateZoomControl }> = ({ control }) => {
    const getUiString = useUiStrings();
    const controlGranularities = useDashboardSelector(
        selectControlGranularities,
    );
    const availableCustomGranularities = useDashboardSelector(
        selectAvailableCustomGranularities,
    );
    const isOpen = useDateZoomEditorSelector(
        (c) => c.editingUuid === control.uuid && !c.isNew,
    );
    const open = useDateZoomEditorSelector((c) => c.open);
    // A filter being edited closes first, or asks on unapplied changes
    const requestSwitch = useControlsSidebarSelector((c) => c.requestSwitch);
    const isHidden = control.hidden === true;
    return (
        <DateZoomEditorPopover isOpen={isOpen}>
            <Button
                size="xs"
                variant="default"
                {...{ [DATE_ZOOM_PILL_ATTRIBUTE]: control.uuid }}
                data-in-effect
                data-open={isOpen || undefined}
                data-hidden={isHidden || undefined}
                aria-pressed={isOpen}
                classNames={{ label: filterClasses.label }}
                className={`${filterClasses.button} ${filterClasses.plain} ${parameterClasses.parameterPill}`}
                leftSection={
                    <MantineIcon
                        icon={isHidden ? IconEyeOff : IconCalendar}
                        size="sm"
                        className={filterClasses.statusIcon}
                    />
                }
                onClick={() => requestSwitch(() => open(control.uuid))}
            >
                <Text fz="xs" truncate>
                    <Text span fw={600}>
                        {control.name}
                    </Text>
                    <Text span c="dimmed">
                        {' · '}
                    </Text>
                    <Text span fw={600}>
                        {getGranularityLabel(
                            getControlActiveGranularity(
                                control,
                                controlGranularities,
                            ),
                            availableCustomGranularities,
                            getUiString,
                        )}
                    </Text>
                </Text>
            </Button>
        </DateZoomEditorPopover>
    );
};

// An editor's named zooms with the flag on: each pill opens the controls
// editor, "Add date zoom" starts a new one there
export const DateZoomEditorPills: FC = () => {
    const config = useDashboardDateZoomConfig();
    const isAdding = useDateZoomEditorSelector(
        (c) => c.editingUuid !== null && c.isNew,
    );
    const add = useDateZoomEditorSelector((c) => c.add);
    return (
        <Group gap="xs" wrap="nowrap">
            {config.controls.map((control) => (
                <DateZoomPill key={control.uuid} control={control} />
            ))}
            <InertWhileEditing>
                <DateZoomEditorPopover isOpen={isAdding}>
                    <Button
                        size="xs"
                        variant="default"
                        {...{ [DATE_ZOOM_ADD_ATTRIBUTE]: '' }}
                        classNames={{ root: dateZoomClasses.addControl }}
                        onClick={add}
                    >
                        Add date zoom
                    </Button>
                </DateZoomEditorPopover>
            </InertWhileEditing>
        </Group>
    );
};
