import {
    getAllowedParameterValue,
    interpolateUiString,
    resolveParameterDefault,
    type DashboardParameterControl,
    type ParametersValuesMap,
    type ParameterValue,
    type UiStringResolver,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconAdjustmentsHorizontal, IconPencil } from '@tabler/icons-react';
import { isEqual } from 'es-toolkit/compat';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import TruncatedText from '../../components/common/TruncatedText';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    selectControlSections,
    useDashboardSelector,
} from '../dashboard/store';
import { ParameterInput } from '../parameters/components/ParameterInput';
import { ShadowedReservedNameWarning } from '../parameters/components/ShadowedReservedNameWarning';
import { getParameterDisplayValue } from '../parameters/utils/parameterDisplayValue';
import {
    SettingsChip,
    SettingsHeader,
    ShowToViewersSetting,
    TilesChip,
} from './ControlPopoverParts';
import { focusParameterValueOnMount } from './editorFocus';
import { formatTileCount, formatTilesOf } from './fieldLabels';
import classes from './FilterEditor.module.css';
import { EditorPrompt, type EditorView as PopoverView } from './FilterPopover';
import { useRefocusAfter } from './nameFocus';
import { NameInput } from './NameInput';
import {
    getParameterLabel,
    type ParameterControlParameter,
} from './parameterControlsBar';
import { SectionSetting } from './SectionSetting';
import { useSettingsChipFocus } from './useSettingsChipFocus';

// Apply's reason at no tiles, an editor's, as the filter's

const hasValue = (value: ParameterValue | null) =>
    value !== null && value !== '' && !(Array.isArray(value) && !value.length);

// What clearing the value falls back to, while there is a value to clear.
// Values resolve per parameter key, so a mix of defaults says nothing rather
// than guess; with no default at all each tile keeps its own value
const getClearedCaption = (
    getUiString: UiStringResolver,
    parameters: ParameterControlParameter[],
    timezone: string | undefined,
): string | null => {
    const [firstParameter] = parameters;
    if (firstParameter === undefined) return null;
    const defaults = parameters.map(({ definition }) =>
        resolveParameterDefault(definition, new Date(), timezone),
    );
    const [first] = defaults;
    if (defaults.every((value) => value === undefined))
        return getUiString('controls.parameter.clearedUsesOwnValue');
    return first !== undefined &&
        defaults.every((value) => isEqual(value, first))
        ? interpolateUiString(
              getUiString('controls.parameter.clearedUsesDefault'),
              {
                  value: getParameterDisplayValue(
                      firstParameter.definition,
                      first,
                  ),
              },
          )
        : null;
};

type Props = {
    control: DashboardParameterControl;
    /** Another pill on the bar has the same name: its model, appended (null: none). */
    nameSuffix: string | null;
    /** The parameters it sets that have a definition, in its key order. */
    parameters: ParameterControlParameter[];
    /** What its input edits: its value type, with its first parameter's options. */
    input: ParameterControlParameter;
    /** Distinct tiles it sets: the N in "Sets N of M tiles". */
    tileCount: number;
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
    /** Apply's label (default the registry's "Apply"). */
    applyLabel?: string;
    /** Another pill was clicked over unapplied changes: "Apply changes to ... first?" */
    isAsking: boolean;
    onResolvePending: (shouldApply: boolean) => void;
    onChange: (next: DashboardParameterControl) => void;
    onCancel: () => void;
    onApply: () => void;
    /** Null: the count alone, with no "Choose tiles". */
    onChooseTiles: (() => void) | null;
};

// The filter popover's sentence for a parameter: no operator, the shipped
// parameter input, and the same footer
export const ParameterControlPopover: FC<Props> = ({
    control,
    nameSuffix,
    parameters,
    input,
    tileCount,
    projectUuid,
    projectTimezone,
    parameterValues,
    shadowedReservedNames,
    isViewer,
    isMissingRequired,
    totalTileCount,
    initialView,
    applyLabel,
    isAsking,
    onResolvePending,
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
        useSettingsChipFocus(focusParameterValueOnMount);
    const [first] = parameters;
    const label =
        control.label ??
        (first
            ? getParameterLabel(first)
            : getUiString('controls.parameter.unnamed'));
    const name = nameSuffix === null ? label : `${label} · ${nameSuffix}`;
    const shadowedKey =
        parameters.find(({ key }) => shadowedReservedNames.includes(key))
            ?.key ?? null;
    const applicableValue =
        control.value === null
            ? null
            : getAllowedParameterValue(input.definition, control.value);
    const caption = hasValue(applicableValue)
        ? getClearedCaption(
              getUiString,
              parameters,
              projectTimezone ?? undefined,
          )
        : null;

    const tilesOf = formatTilesOf(getUiString, tileCount, totalTileCount);
    const sets = interpolateUiString(getUiString('controls.sets'), {
        tiles:
            tileCount === totalTileCount
                ? formatTileCount(getUiString, totalTileCount)
                : `${tilesOf.count} ${tilesOf.noun}`,
    });
    const chooseTiles = getUiString('controls.chooseTiles');
    // Editors can save an empty assignment for later mapping.
    const applyBlockedReason =
        tileCount > 0 || !isViewer ? null : getUiString('controls.setsNoTiles');

    const valueView = (
        <Box ref={focusValueView}>
            <Group gap="xs" wrap="nowrap" className={classes.editorHeader}>
                <MantineIcon
                    icon={IconAdjustmentsHorizontal}
                    size={16}
                    color="dimmed"
                />
                {isRenaming ? (
                    <NameInput
                        initial={label}
                        placeholder={first ? getParameterLabel(first) : 'Name'}
                        onCommit={(text) =>
                            onChange({
                                ...control,
                                label:
                                    text.trim() === '' ||
                                    (control.label === null && text === label)
                                        ? null
                                        : text,
                            })
                        }
                        onDone={(how) => {
                            exit.current = how;
                            setIsRenaming(false);
                        }}
                    />
                ) : (
                    <Tooltip
                        label={input.definition.description}
                        disabled={!input.definition.description}
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
                {shadowedKey !== null && !isRenaming && (
                    <ShadowedReservedNameWarning paramKey={shadowedKey} />
                )}
                {!isViewer && !isRenaming && (
                    <Group gap="xs" wrap="nowrap" ml="auto" flex="0 0 auto">
                        {control.hidden && (
                            <Text size="xs" c="dimmed">
                                Hidden from viewers
                            </Text>
                        )}
                        <Tooltip fz="xs" label="Rename">
                            <ActionIcon
                                size="sm"
                                aria-label="Rename"
                                ref={pencilRef}
                                onClick={() => setIsRenaming(true)}
                            >
                                <MantineIcon icon={IconPencil} size={14} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                )}
            </Group>
            <Stack gap="xs" className={classes.content}>
                {/* shortcut: a combined control edits through its first
                    parameter's options; fine while combined ones match */}
                <ParameterInput
                    paramKey={input.key}
                    parameter={input.definition}
                    value={control.value}
                    size="xs"
                    projectUuid={projectUuid}
                    parameterValues={parameterValues}
                    isError={isMissingRequired}
                    dashboardControl={{
                        label: name,
                        unavailableOptions: getUiString(
                            'controls.parameter.unavailableOptions',
                        ),
                        refreshOptions: getUiString(
                            'controls.parameter.refreshOptions',
                        ),
                        clearLabel: getUiString('parameters.clear'),
                    }}
                    onParameterChange={(_key, value) =>
                        onChange({ ...control, value })
                    }
                />
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
            <SettingsHeader
                name={name}
                onBack={() => {
                    markBackFromSettings();
                    setView('value');
                }}
            />
            <Stack gap="sm">
                <SectionSetting
                    sections={sections}
                    sectionId={control.sectionId ?? null}
                    onChange={(sectionId) => {
                        const { sectionId: _previous, ...rest } = control;
                        onChange(
                            sectionId === null ? rest : { ...rest, sectionId },
                        );
                    }}
                />
                <ShowToViewersSetting
                    hidden={!!control.hidden}
                    description="The value still applies to its tiles when hidden."
                    onChange={(hidden) => {
                        const { hidden: _hidden, ...rest } = control;
                        onChange(hidden ? { ...rest, hidden: true } : rest);
                    }}
                />
            </Stack>
        </Stack>
    );

    return (
        <Box className={classes.root} role="dialog" aria-label={name}>
            {isAsking && (
                <EditorPrompt
                    name={name}
                    applyBlockedReason={applyBlockedReason}
                    onResolvePending={onResolvePending}
                />
            )}
            <Box
                className={classes.body}
                data-dimmed={isAsking || undefined}
                inert={isAsking || undefined}
            >
                {view === 'settings' ? settingsView : valueView}
                {view === 'value' && !isViewer && (
                    <Group gap="xs" align="center" px="md" pb="sm">
                        <TilesChip
                            label={sets}
                            chooseTiles={chooseTiles}
                            onChooseTiles={onChooseTiles}
                        />
                        <SettingsChip
                            summary={sectionName}
                            chipRef={focusSettingsChip}
                            onClick={() => setView('settings')}
                        />
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
                                    {applyLabel ?? getUiString('filters.apply')}
                                </Button>
                            </Box>
                        </Tooltip>
                    </Group>
                </Group>
            </Box>
        </Box>
    );
};
