import {
    ChartKind,
    getComposerVizKind,
    getComposerVizKindLabel,
    summarizeComposerVizConfig,
    type AllVizChartConfig,
    type ComposerVizKind,
    type ComposerVizPanelOptions,
    type ResultColumn,
} from '@lightdash/common';
import {
    Box,
    Collapse,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import barStyles from '../composerPipeline/AiComposerPipelinePanel.module.css';
import styles from './AiComposerVizConfigPanel.module.css';
import { AiComposerVizFieldRows } from './AiComposerVizFieldRows';
import { AiComposerVizKindSwitcher } from './AiComposerVizKindSwitcher';
import { getComposerVizKindIcon } from './composerVizKindIcon';

/**
 * `expandable`: the bar opens onto the kind and field controls (terminal node).
 * `switcher`: the bar holds the kind switcher only (other nodes).
 * `static`: the bar shows the summary only (nothing to switch, or no result).
 */
export type AiComposerVizConfigPanelMode = 'expandable' | 'switcher' | 'static';

type Props = {
    value: AllVizChartConfig;
    columns: ResultColumn[];
    options: ComposerVizPanelOptions;
    onChange: (value: AllVizChartConfig) => void;
    onKindChange: (kind: ComposerVizKind) => void;
    mode: AiComposerVizConfigPanelMode;
    expanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
    /** Why the field controls are read-only; null when they are editable. */
    fieldsDisabledReason: string | null;
    /** The displayed node result, above the bar. */
    children: ReactNode;
};

const Summary: FC<{ value: AllVizChartConfig; columns: ResultColumn[] }> = ({
    value,
    columns,
}) => {
    const kind = getComposerVizKind(value);
    const label = getComposerVizKindLabel(kind);
    const text =
        value.type === ChartKind.TABLE
            ? label
            : `${label} · ${summarizeComposerVizConfig(value, columns)}`;
    return (
        <Box component="span" className={styles.summary}>
            <MantineIcon
                icon={getComposerVizKindIcon(kind)}
                size={14}
                color="ldGray.5"
                className={styles.summaryIcon}
            />
            <Text component="span" fz="xs" className={styles.summaryText}>
                {text}
            </Text>
        </Box>
    );
};

/** The viz config panel: a "Chart" bar above the pipeline bar that shows and edits the displayed node's viz config. */
export const AiComposerVizConfigPanel: FC<Props> = ({
    value,
    columns,
    options,
    onChange,
    onKindChange,
    mode,
    expanded,
    onExpandedChange,
    fieldsDisabledReason,
    children,
}) => {
    const kind = getComposerVizKind(value);
    const isOpen = mode === 'expandable' && expanded;
    const heading = (
        <Text component="span" className={barStyles.heading}>
            Chart
        </Text>
    );

    const bar =
        mode === 'expandable' ? (
            <Box className={barStyles.bar}>
                <UnstyledButton
                    className={barStyles.barToggle}
                    onClick={() => onExpandedChange(!expanded)}
                    aria-expanded={isOpen}
                >
                    <MantineIcon
                        icon={IconChevronRight}
                        size={11}
                        stroke={1.6}
                        className={clsx(
                            barStyles.chevron,
                            isOpen && barStyles.chevronOpen,
                        )}
                    />
                    {heading}
                    <Box className={styles.spacer} />
                    <Summary value={value} columns={columns} />
                </UnstyledButton>
            </Box>
        ) : (
            <Box className={clsx(barStyles.bar, styles.staticBar)}>
                {heading}
                <Box className={styles.spacer} />
                {mode === 'switcher' ? (
                    <AiComposerVizKindSwitcher
                        value={kind}
                        availableKinds={options.kinds}
                        onChange={onKindChange}
                    />
                ) : (
                    <Summary value={value} columns={columns} />
                )}
            </Box>
        );

    return (
        <Box className={styles.root}>
            <Box className={styles.result}>{children}</Box>
            {bar}
            {mode === 'expandable' && (
                <Collapse expanded={isOpen} className={styles.body}>
                    <ScrollArea.Autosize mah="45cqh" type="auto">
                        <Stack gap="md" p="md">
                            <AiComposerVizKindSwitcher
                                value={kind}
                                availableKinds={options.kinds}
                                onChange={onKindChange}
                            />
                            {value.type === ChartKind.TABLE ? (
                                <Text size="xs" c="dimmed">
                                    Tables show every column of the result.
                                </Text>
                            ) : (
                                <Tooltip
                                    label={fieldsDisabledReason}
                                    disabled={fieldsDisabledReason === null}
                                    position="top"
                                    withinPortal
                                >
                                    <Box>
                                        <AiComposerVizFieldRows
                                            value={value}
                                            columns={columns}
                                            options={options}
                                            onChange={onChange}
                                            disabled={
                                                fieldsDisabledReason !== null
                                            }
                                        />
                                    </Box>
                                </Tooltip>
                            )}
                        </Stack>
                    </ScrollArea.Autosize>
                </Collapse>
            )}
        </Box>
    );
};
