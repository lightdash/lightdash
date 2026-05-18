import type { AgentSuggestion } from '@lightdash/common';
import { Box, Button, Skeleton } from '@mantine-8/core';
import { useEffect, useRef } from 'react';
import styles from './AgentSuggestionChips.module.css';

type Props = {
    chips: AgentSuggestion[];
    isLoading: boolean;
    onChipClick: (chip: AgentSuggestion, index: number) => void;
    onImpression?: (chipCount: number) => void;
};

const SKELETON_COUNT = 4;

const chipKey = (chip: AgentSuggestion, idx: number) =>
    `${chip.tool}-${chip.label}-${idx}`;

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
            {chips.map((chip, idx) => (
                <Button
                    key={chipKey(chip, idx)}
                    variant="default"
                    size="xs"
                    className={`${styles.chip} ${styles.fadeIn}`}
                    style={{ ['--chip-idx' as string]: idx }}
                    onClick={() => onChipClick(chip, idx)}
                >
                    {chip.label}
                </Button>
            ))}
        </Box>
    );
};
