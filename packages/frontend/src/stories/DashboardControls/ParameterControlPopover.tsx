import {
    formatDate,
    getAllowedParameterValue,
    interpolateUiString,
    parseDate,
    resolveParameterDefault,
    TimeFrames,
    type LightdashProjectParameter,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconAdjustmentsHorizontal,
    IconArrowLeft,
    IconLayoutGrid,
    IconPencil,
    IconSettings,
} from '@tabler/icons-react';
import isEqual from 'lodash/isEqual';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import TruncatedText from '../../components/common/TruncatedText';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    selectControlSections,
    useDashboardSelector,
} from '../../features/dashboard/store';
import {
    formatTileCount,
    formatTilesOf,
} from '../../features/dashboardControls/fieldLabels';
import classes from '../../features/dashboardControls/FilterEditor.module.css';
import { focusOnMount } from '../../features/dashboardControls/mappingFocus';
import { useRefocusAfter } from '../../features/dashboardControls/nameFocus';
import { ParameterInput } from '../../features/parameters/components/ParameterInput';
import { ShadowedReservedNameWarning } from '../../features/parameters/components/ShadowedReservedNameWarning';
import { CONTROL_STRINGS } from './controlStrings';
import { focusInputOnMount } from './focus';
import { NameInput } from './NameInput';
import {
    getParameterLabel,
    type ParameterControl,
    type ParameterOption,
} from './parameterOptions';
import { SectionSetting } from './SectionSetting';
import { useSettingsChipFocus } from './useSettingsChipFocus';
import { type PopoverView } from './views';

const hasValue = (value: ParameterValue | null) =>
    value !== null && value !== '' && !(Array.isArray(value) && !value.length);

// From the shipped `Parameter.tsx` pill's `displayValue` (not exported): a
// date reads as the pill shows it, an array joined
const formatValue = (
    definition: LightdashProjectParameter,
    value: ParameterValue,
) => {
    if (definition.type === 'date' && typeof value === 'string') {
        const date = parseDate(value, TimeFrames.DAY);
        return date ? formatDate(date, TimeFrames.DAY, false) : value;
    }
    return Array.isArray(value) ? value.join(', ') : String(value);
};

// What clearing the value falls back to, while there is a value to clear.
// Values resolve per parameter key, so a mix of defaults says nothing rather
// than guess; with no default at all each tile keeps its own value
const getClearedCaption = (
    parameters: ParameterOption[],
    timezone: string | undefined,
): string | null => {
    const [firstParameter] = parameters;
    if (firstParameter === undefined) return null;
    const defaults = parameters.map(({ definition }) =>
        resolveParameterDefault(definition, new Date(), timezone),
    );
    const [first] = defaults;
    if (defaults.every((value) => value === undefined))
        return CONTROL_STRINGS.clearedUsesOwnValue;
    return first !== undefined &&
        defaults.every((value) => isEqual(value, first))
        ? interpolateUiString(CONTROL_STRINGS.clearedUsesDefault, {
              value: formatValue(firstParameter.definition, first),
          })
        : null;
};

type Props = {
    control: ParameterControl;
    /** For a parameter whose options come from a field's values. */
    projectUuid: string;
    /** Resolves a `today` default on the project's calendar. */
    projectTimezone: string | null;
    /** The dashboard's parameter values, which a field's value search reads. */
    parameterValues: ParametersValuesMap;
    /** Parameter keys that override a system variable of the same name. */
    shadowedReservedNames: string[];
    isViewer: boolean;
    /** A tile needs a value and the control has none: the input's error. */
    isMissingRequired: boolean;
    /** Every tile on the dashboard: the M in "Sets N of M tiles", as filters. */
    totalTileCount: number;
    initialView: PopoverView;
    onChange: (next: ParameterControl) => void;
    onCancel: () => void;
    onApply: () => void;
    onChooseTiles: () => void;
};

// The filter popover's sentence for a parameter: no operator, the shipped
// parameter input, and the same footer
export const ParameterControlPopover: FC<Props> = ({
    control,
    projectUuid,
    projectTimezone,
    parameterValues,
    shadowedReservedNames,
    isViewer,
    isMissingRequired,
    totalTileCount,
    initialView,
    onChange,
    onCancel,
    onApply,
    onChooseTiles,
}) => {
    const getUiString = useUiStrings();
    const sections = useDashboardSelector(selectControlSections);
    // As the filter's Settings chip: the section is its whole summary
    const sectionName =
        sections.find(({ id }) => id === control.sectionId)?.name ?? null;
    const [view, setView] = useState<PopoverView>(initialView);
    const [isRenaming, setIsRenaming] = useState(false);
    const { ref: pencilRef, exit } = useRefocusAfter(isRenaming);
    const { focusValueView, focusSettingsChip, markBackFromSettings } =
        useSettingsChipFocus(focusInputOnMount);
    const [first] = control.parameters;
    const name =
        control.label ?? (first ? getParameterLabel(first) : 'Parameter');
    const shadowedKey =
        control.parameters.find(({ key }) =>
            shadowedReservedNames.includes(key),
        )?.key ?? null;
    // The value the input shows: one outside fixed options reads as unset
    const shownValue =
        first && control.value !== null
            ? getAllowedParameterValue(first.definition, control.value)
            : null;
    const caption = hasValue(shownValue)
        ? getClearedCaption(control.parameters, projectTimezone ?? undefined)
        : null;

    // Distinct tiles: a tile that uses two of its parameters counts once
    const tileCount = new Set(control.tileUuids).size;
    const tilesOf = formatTilesOf(getUiString, tileCount, totalTileCount);
    const sets = interpolateUiString(CONTROL_STRINGS.sets, {
        tiles:
            tileCount === totalTileCount
                ? formatTileCount(getUiString, totalTileCount)
                : `${tilesOf.count} ${tilesOf.noun}`,
    });
    const chooseTiles = getUiString('filters.rail.chooseTiles');
    // As a filter at no tiles, for anyone; a missing required value does not
    // block
    const applyBlockedReason =
        tileCount > 0
            ? null
            : isViewer
              ? CONTROL_STRINGS.setsNoTiles
              : CONTROL_STRINGS.notAppliedToAnyTiles;
    // Always there for editors: with no sections it still holds the moves
    const hasSettings = !isViewer;

    const valueView = (
        <Box ref={focusValueView}>
            <Group gap="xs" wrap="nowrap" px="md" pt="sm">
                <MantineIcon
                    icon={IconAdjustmentsHorizontal}
                    size="lg"
                    color="ldGray.6"
                />
                {isRenaming ? (
                    <NameInput
                        initial={control.label ?? ''}
                        placeholder={first ? getParameterLabel(first) : 'Name'}
                        onCommit={(text) =>
                            onChange({
                                ...control,
                                label: text.trim() === '' ? null : text,
                            })
                        }
                        onDone={(how) => {
                            exit.current = how;
                            setIsRenaming(false);
                        }}
                    />
                ) : (
                    // As the shipped pill: the description on hover
                    <Tooltip
                        label={first?.definition.description}
                        disabled={!first?.definition.description}
                        maw={350}
                        fz="xs"
                        multiline
                    >
                        <Box miw={0}>
                            <TruncatedText maxWidth="100%" fw={500}>
                                {name}
                            </TruncatedText>
                        </Box>
                    </Tooltip>
                )}
                {shadowedKey !== null && (
                    <ShadowedReservedNameWarning paramKey={shadowedKey} />
                )}
                {!isViewer && !isRenaming && (
                    <Tooltip fz="xs" label="Rename">
                        <ActionIcon
                            size="sm"
                            ml="auto"
                            aria-label="Rename"
                            ref={pencilRef}
                            onClick={() => setIsRenaming(true)}
                        >
                            <MantineIcon
                                icon={IconPencil}
                                size={14}
                                strokeWidth={2.25}
                            />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Group>
            <Stack gap="xs" className={classes.content}>
                {first && (
                    // shortcut: a combined control edits through its first
                    // parameter's definition; fine while combined ones match
                    <ParameterInput
                        paramKey={first.key}
                        parameter={first.definition}
                        value={control.value}
                        size="xs"
                        projectUuid={projectUuid}
                        parameterValues={parameterValues}
                        isError={isMissingRequired}
                        onParameterChange={(_key, value) =>
                            onChange({ ...control, value })
                        }
                    />
                )}
                {caption !== null && (
                    <Text fz="xs" c="dimmed">
                        {caption}
                    </Text>
                )}
            </Stack>
        </Box>
    );

    const settingsView = (
        <Stack gap="sm" className={classes.content}>
            <Group gap="xs" wrap="nowrap">
                <Tooltip fz="xs" label="Back">
                    <ActionIcon
                        size="sm"
                        aria-label="Back"
                        ref={focusOnMount}
                        onClick={() => {
                            markBackFromSettings();
                            setView('value');
                        }}
                    >
                        <MantineIcon icon={IconArrowLeft} />
                    </ActionIcon>
                </Tooltip>
                <Box miw={0}>
                    <Title order={6} lh="sm">
                        Settings
                    </Title>
                    <TruncatedText maxWidth="100%" fz="xs" c="dimmed">
                        {name}
                    </TruncatedText>
                </Box>
            </Group>
            <Stack gap="md">
                <SectionSetting
                    sections={sections}
                    sectionId={control.sectionId}
                    onChange={(sectionId) =>
                        onChange({ ...control, sectionId })
                    }
                />
            </Stack>
        </Stack>
    );

    return (
        <Paper
            shadow="md"
            radius="md"
            w="min(400px, calc(100vw - 56px))"
            role="dialog"
            aria-label={name}
        >
            <Box className={classes.body}>
                {view === 'settings' ? settingsView : valueView}
                {view === 'value' && !isViewer && (
                    <Group gap="xs" align="flex-start" px="md" pb="sm">
                        <Button
                            variant="subtle"
                            color="gray"
                            size="compact-xs"
                            mih={24}
                            aria-label={`${sets}. ${chooseTiles}`}
                            leftSection={
                                <MantineIcon icon={IconLayoutGrid} size={14} />
                            }
                            onClick={onChooseTiles}
                        >
                            <Text span fz="xs">
                                <Text span fz="xs" c="dimmed">
                                    {sets}
                                </Text>
                                {` · ${chooseTiles}`}
                            </Text>
                        </Button>
                        {hasSettings && (
                            <Button
                                ref={focusSettingsChip}
                                variant="subtle"
                                color="gray"
                                size="compact-xs"
                                mih={24}
                                leftSection={
                                    <MantineIcon
                                        icon={IconSettings}
                                        size={14}
                                    />
                                }
                                aria-label={
                                    sectionName === null
                                        ? 'Settings'
                                        : `Settings: ${sectionName}`
                                }
                                onClick={() => setView('settings')}
                            >
                                <Text span fz="xs">
                                    Settings
                                    {sectionName !== null && (
                                        <Text span fz="xs" c="dimmed">
                                            {` · ${sectionName}`}
                                        </Text>
                                    )}
                                </Text>
                            </Button>
                        )}
                    </Group>
                )}
                <Group
                    justify="flex-end"
                    wrap="nowrap"
                    className={classes.footer}
                >
                    <Group gap="xs" wrap="nowrap" flex="0 0 auto">
                        <Button variant="default" size="xs" onClick={onCancel}>
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
                                    onClick={onApply}
                                >
                                    {getUiString('filters.apply')}
                                </Button>
                            </Box>
                        </Tooltip>
                    </Group>
                </Group>
            </Box>
        </Paper>
    );
};
