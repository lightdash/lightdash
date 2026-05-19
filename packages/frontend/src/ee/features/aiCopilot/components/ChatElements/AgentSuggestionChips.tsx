import type { AgentSuggestion } from '@lightdash/common';
import { Box, Button, Skeleton, Text } from '@mantine-8/core';
import { IconArrowUpRight } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import styles from './AgentSuggestionChips.module.css';

type Props = {
    chips: AgentSuggestion[];
    isLoading: boolean;
    loadingVariant?: 'skeleton' | 'follow-up';
    onChipClick: (chip: AgentSuggestion, index: number) => void;
    onImpression?: (chipCount: number) => void;
};

const SKELETON_COUNT = 4;

const chipKey = (chip: AgentSuggestion, idx: number) =>
    chip.kind === 'navigate'
        ? `nav-${chip.url}-${chip.label}-${idx}`
        : `prom-${chip.tool}-${chip.label}-${idx}`;

const renderLeftIcon = (chip: AgentSuggestion) => {
    if (chip.kind !== 'navigate') return undefined;
    return <MantineIcon icon={IconArrowUpRight} size={13} stroke={1.75} />;
};

export const AgentSuggestionChips = ({
    chips,
    isLoading,
    loadingVariant = 'skeleton',
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
        if (loadingVariant === 'follow-up') {
            return (
                <Box className={styles.followUpLoader}>
                    <Text
                        component="span"
                        size="xs"
                        className={styles.loaderText}
                    >
                        Finding good follow-ups
                    </Text>
                    <Box className={styles.loaderDots} aria-hidden>
                        <span />
                        <span />
                        <span />
                    </Box>
                </Box>
            );
        }

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
                if (chip.kind === 'navigate') classes.push(styles.navigateChip);
                return (
                    <Button
                        key={chipKey(chip, idx)}
                        variant="default"
                        size="xs"
                        className={classes.join(' ')}
                        style={{ ['--chip-idx' as string]: idx }}
                        leftSection={renderLeftIcon(chip)}
                        onClick={() => onChipClick(chip, idx)}
                    >
                        {chip.label}
                    </Button>
                );
            })}
        </Box>
    );
};
