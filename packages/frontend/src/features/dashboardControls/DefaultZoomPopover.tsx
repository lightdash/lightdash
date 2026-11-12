import { Box, Group, Stack, Text } from '@mantine/core';
import { IconCalendarSearch } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { TilesChip } from './ControlPopoverParts';
import { focusParameterValueOnMount } from './editorFocus';
import { formatTileCount } from './fieldLabels';
import classes from './FilterEditor.module.css';
import { EditorActions, EditorFrame } from './FilterPopover';
import { GrainSelect } from './GrainSelect';

type Props = {
    /** The grains viewers can pick, which the select offers. */
    enabledGranularities: string[];
    /** The editor's draft default; null: cleared. */
    value: string | null;
    /** The dashboard's custom grains, by key. */
    customLabels: Record<string, string>;
    /** Zoomable tiles in no named zoom: the N in "Applies to the other N tiles". */
    tileCount: number;
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
    value,
    customLabels,
    tileCount,
    isAsking,
    onResolvePending,
    onChange,
    onCancel,
    onApply,
}) => {
    const getUiString = useUiStrings();
    const title = getUiString('dateZoom.defaultZoom');
    // As the shipped menu's "None": a cleared pick leaves tiles on their own grain
    const caption =
        value === null
            ? null
            : getUiString('controls.dateZoom.clearedKeepsOwnGrain');

    return (
        <EditorFrame
            name={title}
            applyBlockedReason={null}
            isAsking={isAsking}
            onResolvePending={onResolvePending}
            footer={
                <EditorActions
                    applyBlockedReason={null}
                    isApplyDisabled={false}
                    isAsking={isAsking}
                    onCancel={onCancel}
                    onApply={onApply}
                />
            }
        >
            <Box ref={focusParameterValueOnMount}>
                <Group gap="xs" wrap="nowrap" className={classes.editorHeader}>
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
                        placeholder={getUiString('dateZoom.none')}
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
            <Group gap="xs" align="center" px="md" pb="sm">
                <TilesChip
                    label={`Applies to the other ${formatTileCount(getUiString, tileCount)}`}
                    chooseTiles={getUiString('controls.chooseTiles')}
                    onChooseTiles={null}
                />
            </Group>
        </EditorFrame>
    );
};
