import {
    friendlyName,
    isAgentOnboardingRunTerminal,
    type AgentOnboardingRun,
} from '@lightdash/common';
import { Box, Stack, Text, UnstyledButton } from '@mantine/core';
import {
    IconChartBar,
    IconCheck,
    IconChevronDown,
    IconTable,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
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
    hrefFor: ((item: string) => string) | null;
    icon: TablerIcon;
    // Long lists start folded behind a count, opened on demand
    countLabel: ((count: number) => string) | null;
}> = ({ label, items, hrefFor, icon, countLabel }) => {
    const [isOpen, setIsOpen] = useState(false);
    if (items.length === 0) return null;
    const extra = items.length - MAX_CHIPS;
    const isFolded = countLabel !== null && !isOpen;
    return (
        <Box className={classes.row}>
            <Text fz="xs" c="dimmed" className={classes.rowLabel}>
                {label}
            </Text>
            {isFolded ? (
                <UnstyledButton
                    className={classes.fold}
                    aria-expanded={false}
                    onClick={() => setIsOpen(true)}
                >
                    <MantineIcon icon={icon} size={12} />
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
                                <MantineIcon icon={icon} size={12} />
                                {item}
                            </Box>
                        ) : (
                            <Box key={item} className={classes.chip}>
                                <MantineIcon icon={icon} size={12} />
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

/** What the run added to the project, named the way a person would say it */
export const RunChanges: FC<{
    run: AgentOnboardingRun;
    // Off where the semantic layer has its own section
    withModels: boolean;
}> = ({ run, withModels }) => {
    const { tables, models, charts } = useMemo(
        () => collectAgentOnboardingArtifacts(run.events),
        [run.events],
    );
    const isDone = run.status === 'completed';

    if (tables.length === 0 && charts.length === 0 && !withModels) return null;

    return (
        <Stack gap="md">
            {withModels && (
                <ChangeRow
                    label="Metrics on"
                    items={models}
                    hrefFor={
                        isDone
                            ? (model) =>
                                  `/projects/${run.projectUuid}/tables/${model}`
                            : null
                    }
                    icon={IconTable}
                    countLabel={null}
                />
            )}
            <ChangeRow
                label="Charts"
                items={charts}
                hrefFor={null}
                icon={IconChartBar}
                countLabel={(count) =>
                    count === 1 ? '1 chart' : `${count} charts`
                }
            />
            <ChangeRow
                label="Tables read"
                items={tables.map(friendlyName)}
                hrefFor={null}
                icon={IconTable}
                countLabel={null}
            />
        </Stack>
    );
};
