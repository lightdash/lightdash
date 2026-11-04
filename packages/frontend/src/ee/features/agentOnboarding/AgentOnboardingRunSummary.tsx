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
    IconChevronDown,
    IconMessageQuestion,
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
import {
    collectAgentOnboardingArtifacts,
    SEMANTIC_LAYER_ANCHOR,
} from './utils';

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
        <Box data-color-mode={colorScheme} data-variant={variant}>
            <MarkdownPreview
                source={source}
                rehypePlugins={markdownSanitizeRehypePlugins}
                rehypeRewrite={rehypeRewrite}
                className={classes.notes}
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
    // null for stats that jump elsewhere instead of unfolding
    isOpen: boolean | null;
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
                {isOpen !== null && (
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
            aria-expanded={isOpen ?? undefined}
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
export const RunSummary: FC<{
    run: AgentOnboardingRun;
}> = ({ run }) => {
    const { tables } = useMemo(
        () => collectAgentOnboardingArtifacts(run.events),
        [run.events],
    );
    const questions = run.handoff?.starterQuestions ?? [];
    const showSemanticLayer = () =>
        document
            .getElementById(SEMANTIC_LAYER_ANCHOR)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const { metricCount, dimensionCount } = useRunSemanticLayer(run);
    const [isQuestionsOpen, setIsQuestionsOpen] = useState(false);
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
                    isOpen={null}
                />
                <Stat
                    icon={Icon123}
                    kind="metric"
                    value={metricCount}
                    label={metricCount === 1 ? 'metric' : 'metrics'}
                    detail={[]}
                    onClick={showSemanticLayer}
                    isOpen={null}
                />
                <Stat
                    icon={IconAbc}
                    kind="dimension"
                    value={dimensionCount}
                    label={dimensionCount === 1 ? 'dimension' : 'dimensions'}
                    detail={[]}
                    onClick={showSemanticLayer}
                    isOpen={null}
                />
                <Stat
                    icon={IconMessageQuestion}
                    kind="plain"
                    value={questions.length}
                    label={
                        questions.length === 1
                            ? 'starter question'
                            : 'starter questions'
                    }
                    detail={[]}
                    onClick={
                        questions.length > 0
                            ? () => setIsQuestionsOpen((value) => !value)
                            : null
                    }
                    isOpen={isQuestionsOpen}
                />
            </Box>

            {isQuestionsOpen && (
                <Box className={classes.chips}>
                    {questions.map((question) => (
                        <Box key={question} className={classes.chip}>
                            <MantineIcon icon={IconMessageQuestion} size={12} />
                            {question}
                        </Box>
                    ))}
                </Box>
            )}

            {nextAction && (
                <Box className={classes.nextAction}>
                    <Box className={classes.nextCheck} aria-hidden />
                    <Stack gap={2} miw={0}>
                        <Text fz="xs" fw={500}>
                            Next step
                        </Text>
                        <Notes
                            source={nextAction.replace(NEXT_ACTION_PATTERN, '')}
                            variant="body"
                        />
                    </Stack>
                </Box>
            )}

            {rest && (
                <Box>
                    <UnstyledButton
                        className={classes.more}
                        aria-expanded={isNotesOpen}
                        onClick={() => setIsNotesOpen((value) => !value)}
                    >
                        <Text fz="xs" c="dimmed">
                            {isNotesOpen
                                ? 'Hide full notes'
                                : 'Show full notes'}
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
