import type { AgentSuggestion } from '@lightdash/common';
import { Box, Button, Skeleton } from '@mantine-8/core';
import {
    IconCalendarTime,
    IconChartHistogram,
    IconCompass,
    IconDeviceFloppy,
    IconPin,
    type Icon,
} from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import type {
    PostResponseActionId,
    PostResponseChip,
} from '../../hooks/usePostResponseChips';
import styles from './AgentSuggestionChips.module.css';

export type DisplayChip =
    | { source: 'empty-state'; data: AgentSuggestion }
    | { source: 'post-response'; data: PostResponseChip };

type Props = {
    chips: DisplayChip[];
    isLoading: boolean;
    onChipClick: (chip: DisplayChip, index: number) => void;
    onImpression?: (chipCount: number) => void;
};

const SKELETON_COUNT = 4;

const ACTION_ICONS: Record<PostResponseActionId, Icon> = {
    saveAsChart: IconDeviceFloppy,
    pinToDashboard: IconPin,
    openInExplore: IconCompass,
    scheduleDelivery: IconCalendarTime,
};

const renderLeftIcon = (chip: DisplayChip) => {
    if (chip.source !== 'post-response') return undefined;
    if (chip.data.kind !== 'action') return undefined;
    const Icon = ACTION_ICONS[chip.data.action] ?? IconChartHistogram;
    return <MantineIcon icon={Icon} size={14} />;
};

const chipKey = (chip: DisplayChip, idx: number) => {
    if (chip.source === 'empty-state') {
        return `es-${chip.data.tool}-${chip.data.label}-${idx}`;
    }
    return `pr-${chip.data.kind}-${chip.data.label}-${idx}`;
};

const isActionChip = (chip: DisplayChip) =>
    chip.source === 'post-response' && chip.data.kind === 'action';

export const AgentSuggestionChips = ({
    chips,
    isLoading,
    onChipClick,
    onImpression,
}: Props) => {
    const impressedRef = useRef<string | null>(null);

    useEffect(() => {
        if (isLoading) return;
        if (chips.length === 0) return;
        const fingerprint = chips.map((c, i) => chipKey(c, i)).join('|');
        if (impressedRef.current === fingerprint) return;
        impressedRef.current = fingerprint;
        onImpression?.(chips.length);
    }, [chips, isLoading, onImpression]);

    if (isLoading) {
        return (
            <Box className={styles.row}>
                {Array.from({ length: SKELETON_COUNT }).map((_, idx) => (
                    <Skeleton
                        // eslint-disable-next-line react/no-array-index-key
                        key={idx}
                        className={styles.skeleton}
                        width={idx % 2 === 0 ? 180 : 220}
                    />
                ))}
            </Box>
        );
    }

    if (chips.length === 0) return null;

    return (
        <Box className={styles.row}>
            {chips.map((chip, idx) => {
                const classes = [styles.chip, styles.fadeIn];
                if (isActionChip(chip)) classes.push(styles.actionChip);
                return (
                    <Button
                        key={chipKey(chip, idx)}
                        variant="default"
                        size="xs"
                        className={classes.join(' ')}
                        leftSection={renderLeftIcon(chip)}
                        onClick={() => onChipClick(chip, idx)}
                    >
                        {chip.data.label}
                    </Button>
                );
            })}
        </Box>
    );
};
