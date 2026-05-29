import type { AgentSuggestion } from '@lightdash/common';
import { Box, Button } from '@mantine-8/core';
import { IconArrowUpRight } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import styles from './AgentSuggestionChips.module.css';

type Props = {
    chips: AgentSuggestion[];
    onChipClick: (chip: AgentSuggestion, index: number) => void;
    onImpression?: (chipCount: number) => void;
};

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
    onChipClick,
    onImpression,
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
