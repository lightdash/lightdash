import { type ChartType } from '@lightdash/common';
import {
    Box,
    Collapse,
    ScrollArea,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import VisualizationConfig from '../../../../../../components/Explorer/VisualizationCard/VisualizationConfig';
import barStyles from '../composerPipeline/AiComposerPipelinePanel.module.css';
import styles from './AiComposerVizConfigPanel.module.css';

const READ_ONLY_REASON =
    'Only the thread owner or an agent admin can change this chart';

type Props = {
    chartType: ChartType;
    expanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
    /** Whether edits are written back; read-only panels still show the config. */
    editable: boolean;
};

/**
 * The "Chart" bar under a composer result: opens onto the explorer's own
 * config panel for the chart type, the same one the explorer and dashboards
 * use. Must render inside the result's `VisualizationProvider`.
 */
export const AiComposerVizConfigPanel: FC<Props> = ({
    chartType,
    expanded,
    onExpandedChange,
    editable,
}) => (
    <Box className={styles.root}>
        <Box className={barStyles.bar}>
            <UnstyledButton
                className={barStyles.barToggle}
                onClick={() => onExpandedChange(!expanded)}
                aria-expanded={expanded}
                data-editable={editable}
            >
                <MantineIcon
                    icon={IconChevronRight}
                    size={11}
                    stroke={1.6}
                    className={clsx(
                        barStyles.chevron,
                        expanded && barStyles.chevronOpen,
                    )}
                />
                <Text component="span" className={barStyles.heading}>
                    Chart
                </Text>
            </UnstyledButton>
        </Box>
        <Collapse
            expanded={expanded}
            transitionDuration={0}
            className={styles.body}
        >
            <Tooltip
                label={READ_ONLY_REASON}
                disabled={editable}
                position="top"
                withinPortal
            >
                <Box
                    className={clsx(
                        styles.fieldRows,
                        !editable && styles.readOnly,
                    )}
                >
                    <ScrollArea.Autosize mah="45cqh" type="auto">
                        <VisualizationConfig chartType={chartType} />
                    </ScrollArea.Autosize>
                </Box>
            </Tooltip>
        </Collapse>
    </Box>
);
