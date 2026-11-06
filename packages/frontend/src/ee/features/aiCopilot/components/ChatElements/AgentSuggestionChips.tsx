import type { AgentSuggestion } from '@lightdash/common';
import { Box, Button, Stack, Tooltip } from '@mantine/core';
import { IconArrowUpRight } from '@tabler/icons-react';
import { useEffect, useLayoutEffect, useMemo, useRef, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useIsTruncated } from '../../../../../hooks/useIsTruncated';
import styles from './AgentSuggestionChips.module.css';

type Props = {
    chips: AgentSuggestion[];
    onChipClick: (chip: AgentSuggestion, index: number) => void;
    onImpression?: (chipCount: number) => void;
    align?: 'center' | 'left';
    /** `compact`: small one-line chips for follow-ups in a thread, at most two rows. */
    layout?: 'chips' | 'compact' | 'list';
    showPromptAffordance?: boolean;
    maxVisible?: number;
    disabled?: boolean;
};

const chipKey = (chip: AgentSuggestion, idx: number) =>
    chip.kind === 'navigate'
        ? `nav-${chip.url}-${chip.label}-${idx}`
        : `prom-${chip.tool}-${chip.label}-${idx}`;

const tourAnchorProps = (chip: AgentSuggestion) =>
    chip.kind === 'prompt'
        ? {
              'data-tour-anchor': 'ai-suggestion',
              'data-tour-hint': 'Pick a suggested question',
          }
        : {};

const COMPACT_MAX_ROWS = 2;

// Hides chips that wrap past the row limit, so none sit clipped or tabbable.
const useRowLimit = (maxRows: number, chips: AgentSuggestion[]) => {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const row = ref.current;
        if (!row) return;
        let lastWidth: number | null = null;
        const apply = () => {
            if (row.clientWidth === lastWidth) return;
            lastWidth = row.clientWidth;
            const items = Array.from(row.children).filter(
                (el): el is HTMLElement => el instanceof HTMLElement,
            );
            items.forEach((el) => el.removeAttribute('data-overflow'));
            const rowTops = [...new Set(items.map((el) => el.offsetTop))].sort(
                (a, b) => a - b,
            );
            const firstHiddenTop = rowTops[maxRows];
            if (firstHiddenTop === undefined) return;
            items.forEach((el) => {
                if (el.offsetTop >= firstHiddenTop) {
                    el.setAttribute('data-overflow', 'true');
                }
            });
        };
        apply();
        const observer = new ResizeObserver(apply);
        observer.observe(row);
        return () => observer.disconnect();
    }, [maxRows, chips]);
    return ref;
};

const CompactChip: FC<{
    chip: AgentSuggestion;
    index: number;
    disabled: boolean;
    onClick: () => void;
}> = ({ chip, index, disabled, onClick }) => {
    const { ref, isTruncated } = useIsTruncated<HTMLButtonElement>(
        `.${styles.compactChipLabel}`,
    );
    return (
        <Tooltip
            label={chip.label}
            disabled={!isTruncated}
            multiline
            maw={420}
            openDelay={400}
        >
            <Button
                ref={ref}
                disabled={disabled}
                variant="default"
                size="compact-sm"
                className={`${styles.compactChip} ${styles.fadeIn}`}
                classNames={{ label: styles.compactChipLabel }}
                style={{ '--chip-idx': index }}
                data-kind={chip.kind}
                onClick={onClick}
                {...tourAnchorProps(chip)}
            >
                {chip.label}
            </Button>
        </Tooltip>
    );
};

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

export const AgentSuggestionChips = ({
    chips,
    onChipClick,
    onImpression,
    align = 'center',
    layout = 'chips',
    showPromptAffordance = false,
    maxVisible,
    disabled = false,
}: Props) => {
    const impressedRef = useRef<string | null>(null);
    const visibleChips = useMemo(
        () => (maxVisible === undefined ? chips : chips.slice(0, maxVisible)),
        [chips, maxVisible],
    );
    const compactRowRef = useRowLimit(COMPACT_MAX_ROWS, visibleChips);

    useEffect(() => {
        if (visibleChips.length === 0) return;
        const fingerprint = visibleChips.map((c, i) => chipKey(c, i)).join('|');
        if (impressedRef.current === fingerprint) return;
        impressedRef.current = fingerprint;
        onImpression?.(visibleChips.length);
    }, [visibleChips, onImpression]);

    if (visibleChips.length === 0) return null;

    if (layout === 'compact') {
        return (
            <Box ref={compactRowRef} className={styles.compactRow}>
                {visibleChips.map((chip, idx) => (
                    <CompactChip
                        key={chipKey(chip, idx)}
                        chip={chip}
                        index={idx}
                        disabled={disabled}
                        onClick={() => onChipClick(chip, idx)}
                    />
                ))}
            </Box>
        );
    }

    if (layout === 'list') {
        return (
            <Stack gap={2} className={styles.list}>
                {visibleChips.map((chip, idx) => (
                    <Button
                        key={chipKey(chip, idx)}
                        disabled={disabled}
                        variant="subtle"
                        size="sm"
                        fullWidth
                        className={`${styles.listItem} ${styles.fadeIn}`}
                        classNames={{
                            inner: styles.listItemInner,
                            label: styles.listItemLabel,
                        }}
                        style={{ '--chip-idx': idx }}
                        data-kind={chip.kind}
                        rightSection={
                            <MantineIcon
                                icon={IconArrowUpRight}
                                size={14}
                                stroke={1.5}
                                className={styles.listItemIcon}
                            />
                        }
                        onClick={() => onChipClick(chip, idx)}
                        {...tourAnchorProps(chip)}
                    >
                        {chip.label}
                    </Button>
                ))}
            </Stack>
        );
    }

    return (
        <Box
            className={`${styles.row} ${align === 'left' ? styles.rowLeft : ''}`}
        >
            {visibleChips.map((chip, idx) => {
                const classes = [styles.chip, styles.fadeIn];
                if (chip.kind === 'navigate') classes.push(styles.navigateChip);
                return (
                    <Button
                        key={chipKey(chip, idx)}
                        disabled={disabled}
                        variant="default"
                        size="xs"
                        className={classes.join(' ')}
                        style={{ '--chip-idx': idx }}
                        leftSection={renderLeftIcon(chip)}
                        rightSection={renderRightIcon(
                            chip,
                            showPromptAffordance,
                        )}
                        onClick={() => onChipClick(chip, idx)}
                        // Walkthrough anchor: a question the learner can ask
                        // without typing. Navigate chips (continue a thread)
                        // carry no anchor. See scripts/scope-tours/generate.ts.
                        {...(chip.kind === 'prompt'
                            ? {
                                  'data-tour-anchor': 'ai-suggestion',
                                  'data-tour-hint': 'Pick a suggested question',
                              }
                            : {})}
                    >
                        {chip.label}
                    </Button>
                );
            })}
        </Box>
    );
};
