import { type AgentOnboardingRun, friendlyName } from '@lightdash/common';
import {
    Box,
    Paper,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
    useMantineColorScheme,
} from '@mantine/core';
import {
    Icon123,
    IconAbc,
    IconChartBar,
    IconChevronDown,
    IconTable,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    markdownSanitizeRehypePlugins,
    rehypeRemoveHeaderLinks,
} from '../../../utils/markdownUtils';
import classes from './AgentOnboardingRunSummary.module.css';
import { useRunSemanticLayer } from './hooks/useAgentOnboarding';
import { collectAgentOnboardingArtifacts } from './utils';

const isInAppHref = (href: string) => /^(https?:|mailto:|\/|#)/.test(href);

// The agent links its own report by relative path, which has no page here
const rehypeRewrite: React.ComponentProps<
    typeof MarkdownPreview
>['rehypeRewrite'] = (node, index, parent) => {
    rehypeRemoveHeaderLinks?.(node, index, parent);
    if (
        node.type === 'element' &&
        node.tagName === 'a' &&
        !isInAppHref(String(node.properties?.href ?? ''))
    ) {
        node.tagName = 'span';
        node.properties = {};
        return;
    }
    // Bare URLs read as "Open" next to their bold label
    const [child] =
        node.type === 'element' && node.tagName === 'a' ? node.children : [];
    if (
        child?.type === 'text' &&
        node.type === 'element' &&
        child.value === String(node.properties?.href ?? '')
    ) {
        child.value = 'Open';
    }
};

const NEXT_ACTION_PATTERN = /^\*\*Next (?:action|step)s?:\*\*\s*/i;

const Notes: FC<{ source: string; variant: 'lead' | 'body' }> = ({
    source,
    variant,
}) => {
    const { colorScheme } = useMantineColorScheme();
    return (
        <Box data-color-mode={colorScheme}>
            <MarkdownPreview
                source={source}
                rehypePlugins={markdownSanitizeRehypePlugins}
                rehypeRewrite={rehypeRewrite}
                className={classes.notesMarkdown}
                data-variant={variant}
            />
        </Box>
    );
};
const Stat: FC<{
    icon: TablerIcon;
    kind: 'metric' | 'dimension' | 'plain';
    value: number;
    label: string;
    detail: string[];
    onClick: (() => void) | null;
    isOpen: boolean;
}> = ({ icon, kind, value, label, detail, onClick, isOpen }) => {
    const body = (
        <>
            <Text fz="lg" fw={600} className={classes.statValue}>
                {value}
            </Text>
            <Box className={classes.statLabel} data-kind={kind}>
                <MantineIcon icon={icon} size={13} />
                <Text fz="xs" c="dimmed">
                    {label}
                </Text>
                {onClick && (
                    <MantineIcon
                        icon={IconChevronDown}
                        size={12}
                        color="dimmed"
                        className={classes.chevron}
                        data-open={isOpen}
                    />
                )}
            </Box>
        </>
    );
    return onClick ? (
        <UnstyledButton
            className={classes.stat}
            onClick={onClick}
            aria-expanded={isOpen}
        >
            {body}
        </UnstyledButton>
    ) : (
        <Tooltip
            label={detail.join(', ')}
            disabled={detail.length === 0}
            multiline
            maw={280}
        >
            <Box className={classes.stat}>{body}</Box>
        </Tooltip>
    );
};

/** What a finished run built, in one card: the agent's summary, the counts, and its suggested next step */
export const RunSummary: FC<{ run: AgentOnboardingRun }> = ({ run }) => {
    const { tables, charts } = useMemo(
        () => collectAgentOnboardingArtifacts(run.events),
        [run.events],
    );
    const { metricCount, dimensionCount } = useRunSemanticLayer(run);
    const [isChartsOpen, setIsChartsOpen] = useState(false);
    const [isNotesOpen, setIsNotesOpen] = useState(false);

    const blocks = (run.handoff?.summary ?? '')
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean);
    const nextAction =
        blocks.find((block) => NEXT_ACTION_PATTERN.test(block)) ?? null;
    const lead = blocks[0] === nextAction ? null : (blocks[0] ?? null);
    const rest = blocks
        .slice(1)
        .filter((block) => block !== nextAction)
        .join('\n\n');

    return (
        <Paper className={classes.card}>
            {lead && <Notes source={lead} variant="lead" />}

            <Box className={classes.stats}>
                <Stat
                    icon={IconTable}
                    kind="plain"
                    value={tables.length}
                    label={tables.length === 1 ? 'table read' : 'tables read'}
                    detail={tables.map(friendlyName)}
                    onClick={null}
                    isOpen={false}
                />
                <Stat
                    icon={Icon123}
                    kind="metric"
                    value={metricCount}
                    label={metricCount === 1 ? 'metric' : 'metrics'}
                    detail={[]}
                    onClick={null}
                    isOpen={false}
                />
                <Stat
                    icon={IconAbc}
                    kind="dimension"
                    value={dimensionCount}
                    label={dimensionCount === 1 ? 'dimension' : 'dimensions'}
                    detail={[]}
                    onClick={null}
                    isOpen={false}
                />
                <Stat
                    icon={IconChartBar}
                    kind="plain"
                    value={charts.length}
                    label={charts.length === 1 ? 'chart' : 'charts'}
                    detail={charts}
                    onClick={
                        charts.length > 0
                            ? () => setIsChartsOpen((value) => !value)
                            : null
                    }
                    isOpen={isChartsOpen}
                />
            </Box>

            {isChartsOpen && (
                <Box className={classes.chips}>
                    {charts.map((chart) => (
                        <Box key={chart} className={classes.chip}>
                            <MantineIcon icon={IconChartBar} size={12} />
                            {chart}
                        </Box>
                    ))}
                </Box>
            )}

            {nextAction && (
                <Stack gap={2} className={classes.nextAction}>
                    <Text fz="xs" fw={500}>
                        Next step
                    </Text>
                    <Notes
                        source={nextAction.replace(NEXT_ACTION_PATTERN, '')}
                        variant="body"
                    />
                </Stack>
            )}

            {rest && (
                <Box>
                    <UnstyledButton
                        className={classes.more}
                        aria-expanded={isNotesOpen}
                        onClick={() => setIsNotesOpen((value) => !value)}
                    >
                        <Text fz="xs" c="dimmed">
                            {isNotesOpen ? 'Hide full notes' : 'Full notes'}
                        </Text>
                        <MantineIcon
                            icon={IconChevronDown}
                            size={12}
                            color="dimmed"
                            className={classes.chevron}
                            data-open={isNotesOpen}
                        />
                    </UnstyledButton>
                    {isNotesOpen && <Notes source={rest} variant="body" />}
                </Box>
            )}
        </Paper>
    );
};
