import {
    DateGranularity,
    interpolateUiString,
    isStandardDateGranularity,
    type DateZoomControl,
} from '@lightdash/common';
import {
    Box,
    Checkbox,
    Group,
    SimpleGrid,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { getGranularityLabel } from '../dateZoom/utils';
import { SettingsChip, SettingsHeader, TilesChip } from './ControlPopoverParts';
import { splitGrains } from './dateZoomGrains';
import { focusParameterValueOnMount } from './editorFocus';
import { formatTileCount } from './fieldLabels';
import classes from './FilterEditor.module.css';
import { EditorActions, type EditorView as PopoverView } from './FilterPopover';
import { GrainSelect } from './GrainSelect';
import { useSettingsChipFocus } from './useSettingsChipFocus';

const STANDARD_GRAINS: string[] = Object.values(DateGranularity);

type DefaultZoom = {
    enabledGranularities: string[];
    defaultGranularity: string | null;
};

type EditorMode = {
    kind: 'editor';
    /** Zoomable tiles in no named zoom: the N in "Zooms the other N tiles". */
    tileCount: number;
    /** Named zooms: a checked grain one of them uses can't be unchecked. */
    namedZooms: Pick<DateZoomControl, 'uuid' | 'name' | 'granularity'>[];
    initialView: PopoverView;
    onApply: (next: DefaultZoom) => void;
};

type ViewerMode = {
    kind: 'viewer';
    /** The viewer's pick; null: the saved default. */
    granularity: string | null;
    onApply: (granularity: string | null) => void;
};

type Props = DefaultZoom & {
    /** The dashboard's custom grains, by key. */
    customLabels: Record<string, string>;
    mode: EditorMode | ViewerMode;
    onCancel: () => void;
};

// Standard grains in their order, then custom ones in the order they were enabled
const toggleGrain = (enabled: string[], grain: string): string[] => {
    const next = enabled.includes(grain)
        ? enabled.filter((other) => other !== grain)
        : [...enabled, grain];
    return [
        ...STANDARD_GRAINS.filter((standard) => next.includes(standard)),
        ...next.filter((other) => !isStandardDateGranularity(other)),
    ];
};

// "Used by Revenue zoom", "Used by 3 date zooms": the checkbox names the grain
const formatGrainUsers = (names: string[]): string =>
    names.length === 1
        ? `Used by ${names[0]}`
        : `Used by ${names.length} date zooms`;

const GrainCheckbox: FC<{
    label: string;
    checked: boolean;
    /** Why it can't be unchecked; null: it can. */
    lockReason: string | null;
    onToggle: () => void;
}> = ({ label, checked, lockReason, onToggle }) => (
    <Tooltip
        fz="xs"
        multiline
        w={220}
        label={lockReason}
        disabled={lockReason === null}
    >
        <Box w="fit-content">
            <Checkbox
                size="xs"
                label={label}
                checked={checked}
                disabled={lockReason !== null}
                onChange={onToggle}
            />
        </Box>
    </Tooltip>
);

/** The dashboard's default zoom: its grain, and the grains viewers can pick. */
export const DefaultZoomPopover: FC<Props> = ({
    enabledGranularities,
    defaultGranularity,
    customLabels,
    mode,
    onCancel,
}) => {
    const getUiString = useUiStrings();
    const [draft, setDraft] = useState<DefaultZoom>({
        enabledGranularities,
        defaultGranularity,
    });
    const [pick, setPick] = useState<string | null>(
        mode.kind === 'viewer'
            ? (mode.granularity ?? defaultGranularity)
            : null,
    );
    const [view, setView] = useState<PopoverView>(
        mode.kind === 'editor' ? mode.initialView : 'value',
    );
    const { focusValueView, focusSettingsChip, markBackFromSettings } =
        useSettingsChipFocus(focusParameterValueOnMount);
    const title = getUiString('dateZoom.defaultZoom');
    const labelOf = (granularity: string) =>
        getGranularityLabel(granularity, customLabels, getUiString);
    const isViewer = mode.kind === 'viewer';
    const value = isViewer ? pick : draft.defaultGranularity;
    // What clearing falls back to, while clearing would change something
    const getCaption = (): string | null => {
        if (value === null) return null;
        if (!isViewer || defaultGranularity === null)
            return getUiString('controls.dateZoom.clearedKeepsOwnGrain');
        return value === defaultGranularity
            ? null
            : interpolateUiString(
                  getUiString('controls.parameter.clearedUsesDefault'),
                  { value: labelOf(defaultGranularity) },
              );
    };
    const caption = getCaption();

    const valueView = (
        <Box ref={focusValueView}>
            <Group gap="xs" wrap="nowrap" className={classes.editorHeader}>
                <MantineIcon icon={IconCalendar} size={16} color="dimmed" />
                <Text fw={500} truncate>
                    {title}
                </Text>
            </Group>
            <Stack gap="xs" className={classes.content}>
                <GrainSelect
                    label={title}
                    granularities={draft.enabledGranularities}
                    customLabels={customLabels}
                    value={value}
                    placeholder={
                        defaultGranularity === null || !isViewer
                            ? getUiString('dateZoom.none')
                            : labelOf(defaultGranularity)
                    }
                    isClearable
                    onChange={(granularity) => {
                        if (isViewer) setPick(granularity);
                        else
                            setDraft((current) => ({
                                ...current,
                                defaultGranularity: granularity,
                            }));
                    }}
                />
                {caption !== null && (
                    <Text fz="xs" c="dimmed">
                        {caption}
                    </Text>
                )}
            </Stack>
        </Box>
    );

    if (mode.kind === 'viewer')
        return (
            <Box className={classes.root} role="dialog" aria-label={title}>
                {valueView}
                <Group
                    justify="flex-end"
                    wrap="nowrap"
                    className={classes.footer}
                >
                    <EditorActions
                        applyBlockedReason={null}
                        isApplyDisabled={false}
                        isAsking={false}
                        onCancel={onCancel}
                        onApply={() => mode.onApply(pick)}
                    />
                </Group>
            </Box>
        );

    const enabled = draft.enabledGranularities;
    const { custom } = splitGrains(
        Object.keys(customLabels),
        customLabels,
        getUiString,
    );
    const toggle = (grain: string) =>
        setDraft((current) => {
            const next = toggleGrain(current.enabledGranularities, grain);
            return {
                enabledGranularities: next,
                // Unchecking the default clears it, as the shipped menu does
                defaultGranularity:
                    current.defaultGranularity !== null &&
                    next.includes(current.defaultGranularity)
                        ? current.defaultGranularity
                        : null,
            };
        });
    // Unchecking a grain a named zoom is at would leave viewers unable to pick it back
    const getLockReason = (grain: string): string | null => {
        if (!enabled.includes(grain)) return null;
        const users = mode.namedZooms
            .filter(({ granularity }) => granularity === grain)
            .map(({ name }) => name);
        if (users.length > 0) return formatGrainUsers(users);
        return enabled.length === 1 ? 'Viewers need at least one grain' : null;
    };
    const checkbox = (grain: string) => (
        <GrainCheckbox
            key={grain}
            label={labelOf(grain)}
            checked={enabled.includes(grain)}
            lockReason={getLockReason(grain)}
            onToggle={() => toggle(grain)}
        />
    );

    const settingsView = (
        <Stack gap="sm" className={classes.content}>
            <SettingsHeader
                name={title}
                onBack={() => {
                    markBackFromSettings();
                    setView('value');
                }}
            />
            <Stack gap="xs">
                <Stack gap={2}>
                    <Text size="xs" fw={600}>
                        Grains viewers can pick
                    </Text>
                    <Text size="xs" c="dimmed">
                        For every date zoom on this dashboard.
                    </Text>
                </Stack>
                <SimpleGrid cols={2} spacing="xs" verticalSpacing={6}>
                    {STANDARD_GRAINS.map(checkbox)}
                </SimpleGrid>
                {custom.length > 0 && (
                    <>
                        <Text size="xs" c="dimmed">
                            {getUiString('controls.dateZoom.custom')}
                        </Text>
                        <SimpleGrid cols={2} spacing="xs" verticalSpacing={6}>
                            {custom.map(checkbox)}
                        </SimpleGrid>
                    </>
                )}
            </Stack>
        </Stack>
    );

    return (
        <Box className={classes.root} role="dialog" aria-label={title}>
            {view === 'settings' ? settingsView : valueView}
            {view === 'value' && (
                <Group gap="xs" align="center" px="md" pb="sm">
                    <TilesChip
                        label={`Zooms the other ${formatTileCount(getUiString, mode.tileCount)}`}
                        chooseTiles={getUiString('controls.chooseTiles')}
                        onChooseTiles={null}
                    />
                    <SettingsChip
                        summary={
                            enabled.length === 1
                                ? '1 grain'
                                : `${enabled.length} grains`
                        }
                        chipRef={focusSettingsChip}
                        onClick={() => setView('settings')}
                    />
                </Group>
            )}
            <Group justify="flex-end" wrap="nowrap" className={classes.footer}>
                <EditorActions
                    applyBlockedReason={null}
                    isApplyDisabled={false}
                    isAsking={false}
                    onCancel={onCancel}
                    onApply={() => mode.onApply(draft)}
                />
            </Group>
        </Box>
    );
};
