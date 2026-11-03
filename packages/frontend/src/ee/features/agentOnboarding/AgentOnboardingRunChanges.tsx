import {
    isAgentOnboardingRunTerminal,
    type AgentOnboardingRun,
} from '@lightdash/common';
import {
    Box,
    Stack,
    Text,
    UnstyledButton,
    useMantineColorScheme,
} from '@mantine/core';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import { AI_NAME } from '../../../components/common/aiName';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    markdownSanitizeRehypePlugins,
    rehypeRemoveHeaderLinks,
} from '../../../utils/markdownUtils';
import classes from './AgentOnboardingRunChanges.module.css';
import {
    collectAgentOnboardingArtifacts,
    describeAgentOnboardingEvent,
} from './utils';

const RECENT_STEPS = 4;
const MAX_CHIPS = 8;

/** The last few things the run did, in plain words */
export const RunRecentSteps: FC<{ run: AgentOnboardingRun }> = ({ run }) => {
    const isLive = !isAgentOnboardingRunTerminal(run.status);
    const recent = run.events
        .flatMap(({ message, createdAt }) => {
            const label = describeAgentOnboardingEvent(message);
            return label ? [{ label, createdAt }] : [];
        })
        .slice(-RECENT_STEPS)
        .reverse();
    if (recent.length === 0 && !isLive) return null;

    return (
        <Box component="ol" className={classes.steps}>
            {recent.length === 0 ? (
                <Box component="li" className={classes.step} data-current>
                    <Box className={classes.pulse} aria-hidden />
                    <Text fz="sm">
                        {run.status === 'queued'
                            ? 'Waiting for a free worker'
                            : 'Getting ready'}
                    </Text>
                </Box>
            ) : (
                recent.map(({ label, createdAt }, index) => {
                    const isCurrent = isLive && index === 0;
                    return (
                        <Box
                            component="li"
                            key={`${createdAt}-${label}`}
                            className={classes.step}
                            data-current={isCurrent}
                        >
                            {isCurrent ? (
                                <Box className={classes.pulse} aria-hidden />
                            ) : (
                                <MantineIcon icon={IconCheck} size={12} />
                            )}
                            <Text fz="sm" truncate>
                                {label}
                            </Text>
                        </Box>
                    );
                })
            )}
        </Box>
    );
};

const ChangeRow: FC<{
    label: string;
    items: string[];
    waiting: string;
    isLive: boolean;
    hrefFor: ((item: string) => string) | null;
    // Long lists start folded behind a count, opened on demand
    countLabel: ((count: number) => string) | null;
}> = ({ label, items, waiting, isLive, hrefFor, countLabel }) => {
    const [isOpen, setIsOpen] = useState(false);
    if (items.length === 0 && !isLive) return null;
    const extra = items.length - MAX_CHIPS;
    const isFolded = countLabel !== null && !isOpen && items.length > 0;
    return (
        <Box className={classes.row}>
            <Text fz="xs" c="dimmed" className={classes.rowLabel}>
                {label}
            </Text>
            {items.length === 0 ? (
                <Text fz="xs" c="dimmed">
                    {waiting}
                </Text>
            ) : isFolded ? (
                <UnstyledButton
                    className={classes.fold}
                    aria-expanded={false}
                    onClick={() => setIsOpen(true)}
                >
                    {countLabel(items.length)}
                    <MantineIcon icon={IconChevronDown} size={12} />
                </UnstyledButton>
            ) : (
                <Box className={classes.chips}>
                    {items.slice(0, MAX_CHIPS).map((item) =>
                        hrefFor ? (
                            <Box
                                component={Link}
                                key={item}
                                to={hrefFor(item)}
                                className={classes.chip}
                                data-link
                            >
                                {item}
                            </Box>
                        ) : (
                            <Box key={item} className={classes.chip}>
                                {item}
                            </Box>
                        ),
                    )}
                    {extra > 0 && (
                        <Text fz="xs" c="dimmed">
                            +{extra} more
                        </Text>
                    )}
                </Box>
            )}
        </Box>
    );
};

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
    }
};

/** What the run added to the project, named the way a person would say it */
export const RunChanges: FC<{
    run: AgentOnboardingRun;
    // Off where the semantic layer has its own section
    withModels: boolean;
}> = ({ run, withModels }) => {
    const { colorScheme } = useMantineColorScheme();
    const { tables, models, charts } = useMemo(
        () => collectAgentOnboardingArtifacts(run.events),
        [run.events],
    );
    const isLive = !isAgentOnboardingRunTerminal(run.status);
    const isDone = run.status === 'completed';
    const summary = isDone ? (run.handoff?.summary ?? null) : null;

    return (
        <Stack gap="md">
            {withModels && (
                <ChangeRow
                    label="Metrics on"
                    items={models}
                    waiting="Once the tables are read"
                    isLive={isLive}
                    hrefFor={
                        isDone
                            ? (model) =>
                                  `/projects/${run.projectUuid}/tables/${model}`
                            : null
                    }
                    countLabel={null}
                />
            )}
            <ChangeRow
                label="Charts"
                items={charts}
                waiting="Once the metrics are live"
                isLive={isLive}
                hrefFor={null}
                countLabel={(count) =>
                    count === 1 ? '1 chart' : `${count} charts`
                }
            />
            <ChangeRow
                label="Tables read"
                items={tables}
                waiting={`${AI_NAME} starts by reading your tables`}
                isLive={isLive}
                hrefFor={null}
                countLabel={null}
            />
            {summary && (
                <Box className={classes.notes}>
                    <Text fz="xs" c="dimmed" mb={4}>
                        Notes from {AI_NAME}
                    </Text>
                    <Box data-color-mode={colorScheme}>
                        <MarkdownPreview
                            source={summary}
                            rehypePlugins={markdownSanitizeRehypePlugins}
                            rehypeRewrite={rehypeRewrite}
                            className={classes.notesMarkdown}
                        />
                    </Box>
                </Box>
            )}
        </Stack>
    );
};
