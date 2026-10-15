import {
    ChartKind,
    getComposerVizKind,
    getComposerVizKindLabel,
    isComposerCustomVizConfig,
    summarizeComposerVizConfig,
    type ComposerCustomVizConfig,
    type ComposerVizConfig,
    type ComposerVizKind,
    type ComposerVizPanelOptions,
    type ResultColumn,
    type SourceQuery,
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
import { useDataAppVisualization } from '../../../../../../features/chartTypes/hooks/useDataAppVisualization';
import barStyles from '../composerPipeline/AiComposerPipelinePanel.module.css';
import { AiComposerCustomVizFieldRows } from './AiComposerCustomVizFieldRows';
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
    projectUuid: string;
    /** The displayed node; splits columns into dimensions and metrics for a custom chart type. */
    node: SourceQuery | null;
    value: ComposerVizConfig;
    columns: ResultColumn[];
    options: ComposerVizPanelOptions;
    onChange: (value: ComposerVizConfig) => void;
    onKindChange: (kind: ComposerVizKind) => void;
    mode: AiComposerVizConfigPanelMode;
    expanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
    /** Why the field controls are read-only; null when they are editable. */
    fieldsDisabledReason: string | null;
    /** The displayed node result, above the bar. */
    children: ReactNode;
};

const useCustomVizName = (
    projectUuid: string,
    value: ComposerCustomVizConfig | null,
): string | null => {
    const { data } = useDataAppVisualization(
        projectUuid,
        value?.dataAppVizUuid ?? null,
        value?.dataAppVizVersion ?? null,
    );
    return data?.name ?? null;
};

const Summary: FC<{
    projectUuid: string;
    value: ComposerVizConfig;
    columns: ResultColumn[];
}> = ({ projectUuid, value, columns }) => {
    const kind = getComposerVizKind(value);
    const label = getComposerVizKindLabel(kind);
    const customName = useCustomVizName(
        projectUuid,
        isComposerCustomVizConfig(value) ? value : null,
    );
    const text = (() => {
        if (isComposerCustomVizConfig(value))
            return customName
                ? `${label} · ${customName}`
                : summarizeComposerVizConfig(value, columns);
        if (value.type === ChartKind.TABLE) return label;
        return `${label} · ${summarizeComposerVizConfig(value, columns)}`;
    })();
    return (
        <Box component="span" className={styles.summary}>
            <MantineIcon
                icon={getComposerVizKindIcon(kind)}
                size={14}
                color="dimmed"
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
    projectUuid,
    node,
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
                    <Summary
                        projectUuid={projectUuid}
                        value={value}
                        columns={columns}
                    />
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
                    <Summary
                        projectUuid={projectUuid}
                        value={value}
                        columns={columns}
                    />
                )}
            </Box>
        );

    return (
        <Box className={styles.root}>
            <Box className={styles.result}>{children}</Box>
            {bar}
            {mode === 'expandable' && (
                <Collapse
                    expanded={isOpen}
                    transitionDuration={0}
                    className={styles.body}
                >
                    <ScrollArea.Autosize mah="45cqh" type="auto">
                        <Stack gap="md" p="md">
                            <AiComposerVizKindSwitcher
                                value={kind}
                                availableKinds={options.kinds}
                                onChange={onKindChange}
                            />
                            {!isComposerCustomVizConfig(value) &&
                            value.type === ChartKind.TABLE ? (
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
                                    <Box className={styles.fieldRows}>
                                        {isComposerCustomVizConfig(value) ? (
                                            <AiComposerCustomVizFieldRows
                                                projectUuid={projectUuid}
                                                value={value}
                                                columns={columns}
                                                node={node}
                                                onChange={onChange}
                                                disabled={
                                                    fieldsDisabledReason !==
                                                    null
                                                }
                                            />
                                        ) : (
                                            <AiComposerVizFieldRows
                                                value={value}
                                                columns={columns}
                                                options={options}
                                                onChange={onChange}
                                                disabled={
                                                    fieldsDisabledReason !==
                                                    null
                                                }
                                            />
                                        )}
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
