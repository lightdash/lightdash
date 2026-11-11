import { interpolateUiString } from '@lightdash/common';
import { Box, Group, Stack, Text } from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { getGranularityLabel } from '../dateZoom/utils';
import { TilesChip } from './ControlPopoverParts';
import { focusParameterValueOnMount } from './editorFocus';
import { formatTileCount } from './fieldLabels';
import classes from './FilterEditor.module.css';
import { EditorActions } from './FilterPopover';
import { GrainSelect } from './GrainSelect';

type EditorMode = {
    kind: 'editor';
    /** Zoomable tiles in no named zoom: the N in "Zooms the other N tiles". */
    tileCount: number;
    onApply: (next: { defaultGranularity: string | null }) => void;
};

type ViewerMode = {
    kind: 'viewer';
    /** The viewer's pick; null: the saved default. */
    granularity: string | null;
    onApply: (granularity: string | null) => void;
};

type Props = {
    /** The grains viewers can pick, which the select offers. */
    enabledGranularities: string[];
    defaultGranularity: string | null;
    /** The dashboard's custom grains, by key. */
    customLabels: Record<string, string>;
    mode: EditorMode | ViewerMode;
    onCancel: () => void;
};

/** The dashboard's default zoom: the grain of tiles in no named zoom. */
export const DefaultZoomPopover: FC<Props> = ({
    enabledGranularities,
    defaultGranularity,
    customLabels,
    mode,
    onCancel,
}) => {
    const getUiString = useUiStrings();
    const [draft, setDraft] = useState(defaultGranularity);
    const [pick, setPick] = useState<string | null>(
        mode.kind === 'viewer'
            ? (mode.granularity ?? defaultGranularity)
            : null,
    );
    const title = getUiString('dateZoom.defaultZoom');
    const labelOf = (granularity: string) =>
        getGranularityLabel(granularity, customLabels, getUiString);
    const isViewer = mode.kind === 'viewer';
    const value = isViewer ? pick : draft;
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
        <Box ref={focusParameterValueOnMount}>
            <Group gap="xs" wrap="nowrap" className={classes.editorHeader}>
                <MantineIcon icon={IconCalendar} size={16} color="dimmed" />
                <Text fw={500} truncate>
                    {title}
                </Text>
            </Group>
            <Stack gap="xs" className={classes.content}>
                <GrainSelect
                    label={title}
                    granularities={enabledGranularities}
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
                        else setDraft(granularity);
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

    return (
        <Box className={classes.root} role="dialog" aria-label={title}>
            {valueView}
            <Group gap="xs" align="center" px="md" pb="sm">
                <TilesChip
                    label={`Zooms the other ${formatTileCount(getUiString, mode.tileCount)}`}
                    chooseTiles={getUiString('controls.chooseTiles')}
                    onChooseTiles={null}
                />
            </Group>
            <Group justify="flex-end" wrap="nowrap" className={classes.footer}>
                <EditorActions
                    applyBlockedReason={null}
                    isApplyDisabled={false}
                    isAsking={false}
                    onCancel={onCancel}
                    onApply={() => mode.onApply({ defaultGranularity: draft })}
                />
            </Group>
        </Box>
    );
};
