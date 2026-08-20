import type { AgentSuggestion } from '@lightdash/common';
import { Box, Button, Skeleton } from '@mantine/core';
import { IconArrowUpRight } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import styles from './AgentSuggestionChips.module.css';

type Props = {
    chips: AgentSuggestion[];
    onChipClick: (chip: AgentSuggestion, index: number) => void;
    onImpression?: (chipCount: number) => void;
    align?: 'center' | 'left';
    showPromptAffordance?: boolean;
};

const chipKey = (chip: AgentSuggestion, idx: number) =>
    chip.kind === 'navigate'
        ? `nav-${chip.url}-${chip.label}-${idx}`
        : `prom-${chip.tool}-${chip.label}-${idx}`;

const renderLeftIcon = (chip: AgentSuggestion) => {
    if (chip.kind !== 'navigate') return undefined;
    return <MantineIcon icon={IconArrowUpRight} size={13} stroke={1.75} />;
};

const renderRightIcon = (
    chip: AgentSuggestion,
    showPromptAffordance: boolean,
) => {
    if (chip.kind !== 'prompt' || !showPromptAffordance) return undefined;
    return <MantineIcon icon={IconArrowUpRight} size={12} stroke={1.75} />;
};

// Suggestions are generated per project, so they land a beat after the
// composer. Stand in for them with chip-shaped skeletons rather than generic
// example prompts, which read as real suggestions until they're swapped out.
const SKELETON_CHIP_WIDTHS = [148, 108, 176];

export const AgentSuggestionChipsSkeleton = () => (
    <Box className={styles.row} data-testid="agent-suggestion-chips-skeleton">
        {SKELETON_CHIP_WIDTHS.map((width) => (
            <Skeleton key={width} className={styles.chipSkeleton} w={width} />
        ))}
    </Box>
);

export const AgentSuggestionChips = ({
    chips,
    onChipClick,
    onImpression,
    align = 'center',
    showPromptAffordance = false,
}: Props) => {
    const impressedRef = useRef<string | null>(null);

    useEffect(() => {
        if (chips.length === 0) return;
        const fingerprint = chips.map((c, i) => chipKey(c, i)).join('|');
        if (impressedRef.current === fingerprint) return;
        impressedRef.current = fingerprint;
        onImpression?.(chips.length);
    }, [chips, onImpression]);

    if (chips.length === 0) return null;

    return (
        <Box
            className={`${styles.row} ${align === 'left' ? styles.rowLeft : ''}`}
        >
            {chips.map((chip, idx) => {
                const classes = [styles.chip, styles.fadeIn];
                if (chip.kind === 'navigate') classes.push(styles.navigateChip);
                return (
                    <Button
                        key={chipKey(chip, idx)}
                        variant="default"
                        size="xs"
                        className={classes.join(' ')}
                        style={{ ['--chip-idx' as string]: idx }}
                        leftSection={renderLeftIcon(chip)}
                        rightSection={renderRightIcon(
                            chip,
                            showPromptAffordance,
                        )}
                        onClick={() => onChipClick(chip, idx)}
                    >
                        {chip.label}
                    </Button>
                );
            })}
        </Box>
    );
};
