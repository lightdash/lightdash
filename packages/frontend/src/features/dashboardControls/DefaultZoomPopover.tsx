import { interpolateUiString } from '@lightdash/common';
import { Box, Group, Stack, Text } from '@mantine/core';
import { IconCalendarSearch } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { getGranularityLabel } from '../dateZoom/utils';
import { TilesChip } from './ControlPopoverParts';
import { focusParameterValueOnMount } from './editorFocus';
import { formatTileCount } from './fieldLabels';
import classes from './FilterEditor.module.css';
import { EditorActions, EditorPrompt } from './FilterPopover';
import { GrainSelect } from './GrainSelect';

type EditorMode = {
    kind: 'editor';
    /** Zoomable tiles in no named zoom: the N in "Zooms the other N tiles". */
    tileCount: number;
};

type ViewerMode = { kind: 'viewer' };

type Props = {
    /** The grains viewers can pick, which the select offers. */
    enabledGranularities: string[];
    /** As saved: what a viewer's cleared pick falls back to. */
    defaultGranularity: string | null;
    /** The editor's draft default, or the viewer's pick; null: cleared. */
    value: string | null;
    /** The dashboard's custom grains, by key. */
    customLabels: Record<string, string>;
    mode: EditorMode | ViewerMode;
    /** Another pill was clicked over unapplied changes: "Apply changes to ... first?" */
    isAsking: boolean;
    onResolvePending: (shouldApply: boolean) => void;
    onChange: (granularity: string | null) => void;
    onCancel: () => void;
    onApply: () => void;
};

/** The dashboard's default zoom: the grain of tiles in no named zoom. */
export const DefaultZoomPopover: FC<Props> = ({
    enabledGranularities,
    defaultGranularity,
    value,
    customLabels,
    mode,
    isAsking,
    onResolvePending,
    onChange,
    onCancel,
    onApply,
}) => {
    const getUiString = useUiStrings();
    const title = getUiString('dateZoom.defaultZoom');
    const labelOf = (granularity: string) =>
        getGranularityLabel(granularity, customLabels, getUiString);
    const isViewer = mode.kind === 'viewer';
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

    const frame = (body: ReactNode) => (
        <Box className={classes.root} role="dialog" aria-label={title}>
            {isAsking && (
                <EditorPrompt
                    name={title}
                    applyBlockedReason={null}
                    onResolvePending={onResolvePending}
                />
            )}
            <Box
                className={classes.body}
                data-dimmed={isAsking || undefined}
                inert={isAsking || undefined}
            >
                <Box ref={focusParameterValueOnMount}>
                    <Group
                        gap="xs"
                        wrap="nowrap"
                        className={classes.editorHeader}
                    >
                        <MantineIcon
                            icon={IconCalendarSearch}
                            size={16}
                            color="dimmed"
                        />
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
                            onChange={onChange}
                        />
                        {caption !== null && (
                            <Text fz="xs" c="dimmed">
                                {caption}
                            </Text>
                        )}
                    </Stack>
                </Box>
                {body}
                <Group
                    justify="flex-end"
                    wrap="nowrap"
                    className={classes.footer}
                >
                    <EditorActions
                        applyBlockedReason={null}
                        isApplyDisabled={false}
                        isAsking={isAsking}
                        onCancel={onCancel}
                        onApply={onApply}
                    />
                </Group>
            </Box>
        </Box>
    );

    if (mode.kind === 'viewer') return frame(null);

    return frame(
        <Group gap="xs" align="center" px="md" pb="sm">
            <TilesChip
                // Editors only: a viewer's popover has no count
                label={`Zooms the other ${formatTileCount(getUiString, mode.tileCount)}`}
                chooseTiles={getUiString('controls.chooseTiles')}
                onChooseTiles={null}
            />
        </Group>,
    );
};
