import {
    interpolateUiString,
    type DashboardControlSection,
    type DateZoomControl,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconCalendarSearch, IconPencil } from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import TruncatedText from '../../components/common/TruncatedText';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { getGranularityLabel } from '../dateZoom/utils';
import {
    SettingsChip,
    SettingsHeader,
    ShowToViewersSetting,
    TilesChip,
} from './ControlPopoverParts';
import { focusParameterValueOnMount } from './editorFocus';
import { formatTileCount, formatTilesOf } from './fieldLabels';
import classes from './FilterEditor.module.css';
import {
    EditorActions,
    EditorPrompt,
    type EditorView as PopoverView,
} from './FilterPopover';
import { GrainSelect } from './GrainSelect';
import { useRefocusAfter } from './nameFocus';
import { NameInput } from './NameInput';
import { SectionSetting } from './SectionSetting';
import { useSettingsChipFocus } from './useSettingsChipFocus';

const DEFAULT_NAME = 'Date zoom';

// A new zoom opens on its name, which takes focus itself
const keepFocus = () => {};

type EditorMode = {
    kind: 'editor';
    /** Just added: it opens on its name. */
    isNew: boolean;
    sections: DashboardControlSection[];
    /** Distinct tiles it zooms: the N in "Zooms N of M tiles". */
    tileCount: number;
    totalTileCount: number;
    initialView: PopoverView;
    onChooseTiles: () => void;
    /** The draft, edited: only Apply takes it to the dashboard. */
    onChange: (next: DateZoomControl) => void;
};

type ViewerMode = {
    kind: 'viewer';
    /** The viewer's pick, from their override else the saved grain; cleared (null): the saved grain. */
    granularity: string | null;
    onChange: (granularity: string | null) => void;
};

type Props = {
    /** The editor's draft; a viewer's, as saved. */
    control: DateZoomControl;
    /** The dashboard's enabled grains, standard then custom. */
    granularities: string[];
    customLabels: Record<string, string>;
    mode: EditorMode | ViewerMode;
    /** Another pill was clicked over unapplied changes: "Apply changes to ... first?" */
    isAsking: boolean;
    onResolvePending: (shouldApply: boolean) => void;
    onCancel: () => void;
    onApply: () => void;
};

/** A named date zoom, as the parameter popover: its grain, tiles and settings. */
export const DateZoomControlPopover: FC<Props> = ({
    control,
    granularities,
    customLabels,
    mode,
    isAsking,
    onResolvePending,
    onCancel,
    onApply,
}) => {
    const getUiString = useUiStrings();
    const isViewer = mode.kind === 'viewer';
    const draft = control;
    const setDraft = (write: (current: DateZoomControl) => DateZoomControl) => {
        if (mode.kind === 'editor') mode.onChange(write(control));
    };
    const pick = mode.kind === 'viewer' ? mode.granularity : null;
    const [view, setView] = useState<PopoverView>(
        mode.kind === 'editor' ? mode.initialView : 'value',
    );
    const isNew = mode.kind === 'editor' && mode.isNew;
    const [isRenaming, setIsRenaming] = useState(isNew);
    const { ref: pencilRef, exit } = useRefocusAfter(isRenaming);
    const { focusValueView, focusSettingsChip, markBackFromSettings } =
        useSettingsChipFocus(isNew ? keepFocus : focusParameterValueOnMount);

    const labelOf = (granularity: string) =>
        getGranularityLabel(granularity, customLabels, getUiString);
    const name = draft.name;
    const caption =
        isViewer && pick !== null && pick !== control.granularity
            ? interpolateUiString(
                  getUiString('controls.dateZoom.clearedUsesSavedGrain'),
                  { grain: labelOf(control.granularity) },
              )
            : null;

    const valueView = (
        <Box ref={focusValueView}>
            <Group gap="xs" wrap="nowrap" className={classes.editorHeader}>
                <MantineIcon
                    icon={IconCalendarSearch}
                    size={16}
                    color="dimmed"
                />
                {isRenaming ? (
                    <NameInput
                        initial={name}
                        placeholder={DEFAULT_NAME}
                        onCommit={(text) =>
                            setDraft((current) => ({
                                ...current,
                                name: text.trim() === '' ? DEFAULT_NAME : text,
                            }))
                        }
                        onDone={(how) => {
                            exit.current = how;
                            setIsRenaming(false);
                        }}
                    />
                ) : (
                    <Box miw={0}>
                        <TruncatedText maxWidth="100%" fw={500}>
                            {name}
                        </TruncatedText>
                    </Box>
                )}
                {!isViewer && !isRenaming && (
                    <Group gap="xs" wrap="nowrap" ml="auto" flex="0 0 auto">
                        {draft.hidden && (
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
                <GrainSelect
                    label={name}
                    granularities={granularities}
                    customLabels={customLabels}
                    value={isViewer ? pick : draft.granularity}
                    placeholder={labelOf(control.granularity)}
                    isClearable={isViewer}
                    onChange={(granularity) => {
                        if (mode.kind === 'viewer') mode.onChange(granularity);
                        else if (granularity !== null)
                            setDraft((current) => ({
                                ...current,
                                granularity,
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

    // As the parameter popover: the question over a dimmed, inert body
    const frame = (applyBlockedReason: string | null, body: ReactNode) => (
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
                {body}
                <Group
                    justify="flex-end"
                    wrap="nowrap"
                    className={classes.footer}
                >
                    <EditorActions
                        applyBlockedReason={applyBlockedReason}
                        isApplyDisabled={false}
                        isAsking={isAsking}
                        onCancel={onCancel}
                        onApply={onApply}
                    />
                </Group>
            </Box>
        </Box>
    );

    if (mode.kind === 'viewer') return frame(null, valueView);

    const { sections, tileCount, totalTileCount } = mode;
    const sectionName =
        sections.find(({ id }) => id === draft.sectionId)?.name ?? null;
    const tilesOf = formatTilesOf(getUiString, tileCount, totalTileCount);
    const zooms =
        tileCount === 0
            ? getUiString('controls.dateZoom.zoomsNoTiles')
            : interpolateUiString(getUiString('controls.dateZoom.zooms'), {
                  tiles:
                      tileCount === totalTileCount
                          ? formatTileCount(getUiString, totalTileCount)
                          : `${tilesOf.count} ${tilesOf.noun}`,
              });
    // A zoom on no tiles does nothing; Choose tiles is right beside it
    const applyBlockedReason =
        tileCount === 0 ? 'Choose at least one tile' : null;

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
                    sectionId={draft.sectionId ?? null}
                    onChange={(sectionId) =>
                        setDraft(({ sectionId: _previous, ...rest }) =>
                            sectionId === null ? rest : { ...rest, sectionId },
                        )
                    }
                />
                <ShowToViewersSetting
                    hidden={!!draft.hidden}
                    description="The grain still applies to its tiles when hidden."
                    onChange={(hidden) =>
                        setDraft(({ hidden: _hidden, ...rest }) =>
                            hidden ? { ...rest, hidden: true } : rest,
                        )
                    }
                />
            </Stack>
        </Stack>
    );

    return frame(
        applyBlockedReason,
        <>
            {view === 'settings' ? settingsView : valueView}
            {view === 'value' && (
                <Group gap="xs" align="center" px="md" pb="sm">
                    <TilesChip
                        label={zooms}
                        chooseTiles={getUiString('controls.chooseTiles')}
                        onChooseTiles={mode.onChooseTiles}
                    />
                    <SettingsChip
                        summary={sectionName}
                        chipRef={focusSettingsChip}
                        onClick={() => setView('settings')}
                    />
                </Group>
            )}
        </>,
    );
};
