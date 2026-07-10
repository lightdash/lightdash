import type { AgentSuggestion } from '@lightdash/common';
import { Box, Button, Text } from '@mantine-8/core';
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

const useSuggestionImpression = (
    chips: AgentSuggestion[],
    onImpression?: (chipCount: number) => void,
) => {
    const impressedRef = useRef<string | null>(null);

    useEffect(() => {
        if (chips.length === 0) return;
        const fingerprint = chips.map((chip, i) => chipKey(chip, i)).join('|');
        if (impressedRef.current === fingerprint) return;
        impressedRef.current = fingerprint;
        onImpression?.(chips.length);
    }, [chips, onImpression]);
};

export const AgentSuggestionChips = ({
    chips,
    onChipClick,
    onImpression,
    align = 'center',
    showPromptAffordance = false,
}: Props) => {
    useSuggestionImpression(chips, onImpression);

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

export const AgentRelatedQueries = ({
    chips,
    onChipClick,
    onImpression,
}: Pick<Props, 'chips' | 'onChipClick' | 'onImpression'>) => {
    useSuggestionImpression(chips, onImpression);

    if (chips.length === 0) return null;

    return (
        <Box
            component="section"
            className={styles.relatedQueries}
            aria-label="Related questions"
        >
            <Text className={styles.relatedQueriesLabel}>
                Related questions
            </Text>
            <Box className={styles.relatedQueriesList}>
                {chips.map((chip, index) => (
                    <button
                        type="button"
                        key={chipKey(chip, index)}
                        className={styles.relatedQuery}
                        onClick={() => onChipClick(chip, index)}
                    >
                        <span>{chip.label}</span>
                        <MantineIcon
                            icon={IconArrowUpRight}
                            size={12}
                            stroke={1.75}
                        />
                    </button>
                ))}
            </Box>
        </Box>
    );
};
