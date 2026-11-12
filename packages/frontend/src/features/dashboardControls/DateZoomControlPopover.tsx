import {
    type DashboardControlSection,
    type DateZoomControl,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconCalendarSearch, IconPencil } from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import TruncatedText from '../../components/common/TruncatedText';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    SettingsChip,
    SettingsHeader,
    ShowToViewersSetting,
    TilesChip,
} from './ControlPopoverParts';
import { focusParameterValueOnMount } from './editorFocus';
import { formatAppliesToTiles } from './fieldLabels';
import classes from './FilterEditor.module.css';
import {
    EditorActions,
    EditorFrame,
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

type Props = {
    /** The editor's draft. */
    control: DateZoomControl;
    /** The dashboard's enabled grains, standard then custom. */
    granularities: string[];
    customLabels: Record<string, string>;
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
    isNew,
    sections,
    tileCount,
    totalTileCount,
    initialView,
    onChooseTiles,
    onChange,
    isAsking,
    onResolvePending,
    onCancel,
    onApply,
}) => {
    const getUiString = useUiStrings();
    const draft = control;
    const setDraft = (write: (current: DateZoomControl) => DateZoomControl) =>
        onChange(write(control));
    const [view, setView] = useState<PopoverView>(initialView);
    const [isRenaming, setIsRenaming] = useState(isNew);
    const { ref: pencilRef, exit } = useRefocusAfter(isRenaming);
    const { focusValueView, focusSettingsChip, markBackFromSettings } =
        useSettingsChipFocus(isNew ? keepFocus : focusParameterValueOnMount);

    const name = draft.name;

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
                {!isRenaming && (
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
                    value={draft.granularity}
                    onChange={(granularity) => {
                        if (granularity !== null)
                            setDraft((current) => ({
                                ...current,
                                granularity,
                            }));
                    }}
                />
            </Stack>
        </Box>
    );

    // As the parameter popover: the question over a dimmed, inert body
    const frame = (applyBlockedReason: string | null, body: ReactNode) => (
        <EditorFrame
            name={name}
            applyBlockedReason={applyBlockedReason}
            isAsking={isAsking}
            onResolvePending={onResolvePending}
            footer={
                <EditorActions
                    applyBlockedReason={applyBlockedReason}
                    isApplyDisabled={false}
                    isAsking={isAsking}
                    onCancel={onCancel}
                    onApply={onApply}
                />
            }
        >
            {body}
        </EditorFrame>
    );

    const sectionName =
        sections.find(({ id }) => id === draft.sectionId)?.name ?? null;
    const zooms = formatAppliesToTiles(getUiString, tileCount, totalTileCount);
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
                        onChooseTiles={onChooseTiles}
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
