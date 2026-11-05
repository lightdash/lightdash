import { Box, Text, UnstyledButton } from '@mantine/core';
import { IconBulb, IconChevronRight } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { stripMarkdown } from '../../../ee/features/aiCopilot/components/ChatElements/ToolCalls/utils/stripMarkdown';
import {
    groupBuildSteps,
    type BuildStepGroup,
    type BuildStepGroupKind,
} from '../utils/groupBuildSteps';
import classes from './BuildCards.module.css';
import { getBuildStepIcon } from './buildStepUtils';

type Props = {
    steps: string[];
    /** The agent's thoughts, shown as one expandable row; empty for none. */
    reasoning: string[];
    /** Marks the latest work as in progress. */
    isLive: boolean;
};

/** Reasoning as a step row: latest thought inline, the rest on click. */
const ThinkingStep: FC<{
    texts: string[];
    isLive: boolean;
    /** No tool step has started yet, so thinking is the current work. */
    isCurrent: boolean;
}> = ({ texts, isLive, isCurrent }) => {
    const [open, setOpen] = useState(false);
    const preview = stripMarkdown(
        isLive ? (texts[texts.length - 1] ?? '') : texts.join(' '),
    );
    return (
        <li>
            <UnstyledButton
                className={classes.step}
                data-current={isCurrent || undefined}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                w="100%"
            >
                <span className={classes.stepIcon}>
                    <MantineIcon icon={IconBulb} size={13} stroke={1.7} />
                </span>
                <Text
                    size="xs"
                    className={classes.stepVerb}
                    data-shimmer={isCurrent || undefined}
                >
                    {isLive ? 'Thinking' : 'Thought it through'}
                </Text>
                <MantineIcon
                    icon={IconChevronRight}
                    size={11}
                    className={classes.activityChevron}
                    data-open={open || undefined}
                />
            </UnstyledButton>
            {/* One text block that unclamps in place, so opening never swaps content. */}
            {preview && (
                <Text
                    size="xs"
                    lineClamp={open ? undefined : 2}
                    className={classes.thinkingLive}
                    data-open={open || undefined}
                >
                    {open
                        ? texts.map((t) => stripMarkdown(t)).join('\n\n')
                        : preview}
                </Text>
            )}
        </li>
    );
};

const GROUP_ICON_STEP: Record<BuildStepGroupKind, string> = {
    models: 'Reading',
    'files-read': 'Reading',
    search: 'Searching',
    'files-edited': 'Editing',
    'files-created': 'Creating',
    other: '',
};

/** One kind of work; with several targets it expands to list them. */
const GroupStep: FC<{ group: BuildStepGroup; isCurrent: boolean }> = ({
    group,
    isCurrent,
}) => {
    const [open, setOpen] = useState(false);
    const expandable = group.targets.length > 1;
    const row = (
        <>
            <span className={classes.stepIcon}>
                <MantineIcon
                    icon={getBuildStepIcon(
                        GROUP_ICON_STEP[group.kind] || group.label,
                    )}
                    size={13}
                    stroke={1.7}
                />
            </span>
            <Text
                size="xs"
                className={classes.stepVerb}
                data-shimmer={isCurrent || undefined}
            >
                {group.label}
            </Text>
            {group.targets.length > 0 && !open && (
                <Text size="xs" truncate className={classes.stepTarget}>
                    {group.targets.join(' · ')}
                </Text>
            )}
            {expandable && (
                <MantineIcon
                    icon={IconChevronRight}
                    size={11}
                    className={classes.activityChevron}
                    data-open={open || undefined}
                />
            )}
        </>
    );
    if (!expandable) {
        return (
            <li className={classes.step} data-current={isCurrent || undefined}>
                {row}
            </li>
        );
    }
    return (
        <li>
            <UnstyledButton
                className={classes.step}
                data-current={isCurrent || undefined}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                w="100%"
            >
                {row}
            </UnstyledButton>
            {open && (
                <Box component="ul" className={classes.stepTargets}>
                    {group.targets.map((target) => (
                        <Text component="li" size="xs" key={target} truncate>
                            {target}
                        </Text>
                    ))}
                </Box>
            )}
        </li>
    );
};

/** Tool steps grouped by kind of work; each group expands to its targets. */
const BuildSteps: FC<Props> = ({ steps, reasoning, isLive }) => {
    const { groups, currentIndex } = groupBuildSteps(steps, isLive);

    return (
        <Box component="ol" className={classes.steps}>
            {reasoning.length > 0 && (
                <ThinkingStep
                    texts={reasoning}
                    isLive={isLive}
                    isCurrent={isLive && groups.length === 0}
                />
            )}
            {groups.map((group, i) => (
                <GroupStep
                    key={`${group.kind}-${group.label}`}
                    group={group}
                    isCurrent={i === currentIndex}
                />
            ))}
        </Box>
    );
};

export default BuildSteps;
