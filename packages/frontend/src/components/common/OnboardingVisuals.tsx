import { ApiConnectorType, WarehouseTypes } from '@lightdash/common';
import { Box, Group, Image, Text } from '@mantine/core';
import {
    IconBrandGithub,
    IconDatabase,
    IconGitPullRequest,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { LiveSourceIcon } from '../../features/externalConnections/liveSources/LiveSourceIcon';
import SlackSvg from '../../svgs/slack.svg?react';
import { WarehouseTypeLabels } from '../ProjectConnection/ProjectConnectFlow/utils';
import MantineIcon from './MantineIcon';
import classes from './OnboardingVisuals.module.css';

const Figure: FC<{
    title: string | null;
    body: string | null;
    children: ReactNode;
}> = ({ title, body, children }) => (
    <Box component="figure" className={classes.figure}>
        <Box className={classes.scene}>{children}</Box>
        {(title || body) && (
            <Box component="figcaption" className={classes.caption}>
                {title && (
                    <Text fz="sm" fw={600}>
                        {title}
                    </Text>
                )}
                {body && (
                    <Text fz="sm" c="dimmed">
                        {body}
                    </Text>
                )}
            </Box>
        )}
    </Box>
);

const Connector: FC<{ index: number }> = ({ index }) => (
    <Box
        className={classes.connector}
        __vars={{ '--i': String(index) }}
        aria-hidden
    >
        <Box className={classes.packet} />
    </Box>
);

const Bars: FC<{ heights: number[]; delay: number }> = ({ heights, delay }) => (
    <Box className={classes.bars} aria-hidden>
        {heights.map((height, index) => (
            <Box
                key={index}
                className={classes.bar}
                __vars={{
                    '--h': `${height}%`,
                    '--i': String(index + delay),
                }}
            />
        ))}
    </Box>
);

const AuroraMark: FC = () => (
    <Box className={classes.auroraMark} aria-hidden>
        <Box className={classes.auroraDot} />
    </Box>
);

const WAREHOUSE_LOGOS = [
    WarehouseTypes.SNOWFLAKE,
    WarehouseTypes.BIGQUERY,
    WarehouseTypes.POSTGRES,
    WarehouseTypes.DATABRICKS,
].flatMap((key) => {
    const entry = WarehouseTypeLabels.find((item) => item.key === key);
    return entry?.iconType === 'image' ? [entry.image] : [];
});

const TABLES: [string, string][] = [
    ['orders', '1.2M rows'],
    ['customers', '84k rows'],
    ['payments', '1.4M rows'],
    ['subscriptions', '22k rows'],
];

const WarehouseVisual: FC = () => (
    <Figure
        title="Build anything on your own tables"
        body="Charts, dashboards and answers from Aurora all run on your warehouse, so every number traces back to the source."
    >
        <Box className={classes.card} __vars={{ '--i': '0' }}>
            <Group gap={8} wrap="nowrap" className={classes.cardHeader}>
                <Box className={classes.logoStack}>
                    {WAREHOUSE_LOGOS.map((logo) => (
                        <Image
                            key={logo}
                            src={logo}
                            w={14}
                            h={14}
                            fit="contain"
                        />
                    ))}
                </Box>
                <Text fz="xs" fw={500}>
                    analytics
                </Text>
                <Text fz="xs" c="dimmed" ml="auto">
                    4 tables
                </Text>
            </Group>
            {TABLES.map(([name, rows], index) => (
                <Box
                    key={name}
                    className={classes.scanRow}
                    __vars={{ '--i': String(index) }}
                >
                    <MantineIcon icon={IconDatabase} size={12} />
                    <Text fz="xs" fw={500}>
                        {name}
                    </Text>
                    <Text fz="xs" c="dimmed" ml="auto">
                        {rows}
                    </Text>
                </Box>
            ))}
        </Box>
        <Connector index={2} />
        <Box className={classes.answer} __vars={{ '--i': '3' }}>
            <Group gap={6} wrap="nowrap">
                <AuroraMark />
                <Text fz="xs" fw={500}>
                    Revenue last month
                </Text>
            </Group>
            <Text fw={600} fz="lg" className={classes.figureNumber}>
                $1.24M
            </Text>
            <Bars heights={[38, 52, 46, 64, 58, 80, 92]} delay={4} />
        </Box>
    </Figure>
);

const SOURCES: [ApiConnectorType, string][] = [
    [ApiConnectorType.POSTHOG, 'events'],
    [ApiConnectorType.GA4, 'sessions'],
    [ApiConnectorType.SEARCH_CONSOLE, 'search clicks'],
];

const getWarehouseLogo = (warehouse: WarehouseTypes) => {
    const entry = WarehouseTypeLabels.find((item) => item.key === warehouse);
    return entry?.iconType === 'image' ? entry.image : null;
};

/** The warehouse card from the previous step, with live sources beside it */
export const ToolsVisual: FC<{ warehouse: WarehouseTypes | null }> = ({
    warehouse,
}) => {
    const warehouseLogo = warehouse ? getWarehouseLogo(warehouse) : null;
    return (
        <Figure
            title="Add what your warehouse is missing"
            body="Product events, traffic and search data sit next to your tables, so Aurora can explain why a number moved."
        >
            <Box className={classes.sourcePair}>
                <Box className={classes.card} __vars={{ '--i': '0' }}>
                    <Group gap={8} wrap="nowrap" className={classes.cardHeader}>
                        <Box className={classes.logoStack}>
                            {(warehouseLogo
                                ? [warehouseLogo]
                                : WAREHOUSE_LOGOS
                            ).map((logo) => (
                                <Image
                                    key={logo}
                                    src={logo}
                                    w={14}
                                    h={14}
                                    fit="contain"
                                />
                            ))}
                        </Box>
                        <Text fz="xs" fw={500}>
                            analytics
                        </Text>
                    </Group>
                    {TABLES.slice(0, 3).map(([name], index) => (
                        <Box
                            key={name}
                            className={classes.scanRow}
                            __vars={{ '--i': String(index) }}
                        >
                            <MantineIcon icon={IconDatabase} size={12} />
                            <Text fz="xs" fw={500}>
                                {name}
                            </Text>
                        </Box>
                    ))}
                </Box>
                <Box className={classes.card} __vars={{ '--i': '1' }}>
                    <Group gap={8} wrap="nowrap" className={classes.cardHeader}>
                        <Text fz="xs" fw={500}>
                            Live sources
                        </Text>
                    </Group>
                    {SOURCES.map(([connector, detail]) => (
                        <Box key={connector} className={classes.sourceRow}>
                            <LiveSourceIcon connector={connector} size={12} />
                            <Text fz="xs" fw={500}>
                                {detail}
                            </Text>
                        </Box>
                    ))}
                </Box>
            </Box>
            <Connector index={2} />
            <Box className={classes.answer} __vars={{ '--i': '3' }}>
                <Group gap={6} wrap="nowrap" mb={8}>
                    <AuroraMark />
                    <Text fz="xs" fw={500}>
                        Signups by campaign, last 30 days
                    </Text>
                </Group>
                {(
                    [
                        ['spring-launch', 1284, 'GA4'],
                        ['newsletter', 842, 'PostHog'],
                        ['brand search', 611, 'Search Console'],
                    ] as const
                ).map(([campaign, signups, source], index) => (
                    <Box
                        key={campaign}
                        className={classes.meterRow}
                        __vars={{ '--i': String(index + 4) }}
                    >
                        <Text fz="xs" truncate>
                            {campaign}
                        </Text>
                        <Box className={classes.meter}>
                            <Box
                                className={classes.meterFill}
                                __vars={{
                                    '--w': `${Math.round((signups / 1284) * 100)}%`,
                                }}
                            />
                        </Box>
                        <Text fz="xs" c="dimmed" className={classes.source}>
                            {source}
                        </Text>
                    </Box>
                ))}
            </Box>
        </Figure>
    );
};

const TeamVisual: FC = () => (
    <Figure title={null} body={null}>
        <Box className={classes.card} __vars={{ '--i': '0' }}>
            <Group gap={6} className={classes.cardHeader}>
                <SlackSvg width={14} height={14} />
                <Text fz="xs" fw={500}>
                    #growth
                </Text>
            </Group>
            <Box className={classes.message}>
                <Box className={classes.avatar}>S</Box>
                <Text fz="xs">
                    <b>Sam</b>{' '}
                    <Box component="span" className={classes.mention}>
                        <Box component="span" className={classes.auroraDot} />
                        Aurora
                    </Box>{' '}
                    how did signups do last week?
                </Text>
            </Box>
            <Box className={classes.message} data-reply __vars={{ '--i': '2' }}>
                <Box className={classes.grow}>
                    <Text fz="xs">
                        <b>Aurora</b> Up 18% to 2,740, mostly from the spring
                        launch.
                    </Text>
                    <Bars heights={[40, 55, 48, 70, 88]} delay={3} />
                </Box>
            </Box>
        </Box>
        <Text
            fz="xs"
            c="dimmed"
            className={classes.cardNote}
            __vars={{ '--i': '1' }}
        >
            Mention Aurora in any channel and it replies in the thread.
        </Text>
        <Box className={classes.card} __vars={{ '--i': '5' }}>
            <Group gap={6} wrap="nowrap" className={classes.cardHeader}>
                <MantineIcon icon={IconBrandGithub} size={14} />
                <Text fz="xs" fw={500} truncate>
                    Add total_revenue to orders
                </Text>
                <Box className={classes.prBadge}>
                    <MantineIcon icon={IconGitPullRequest} size={10} />
                    open
                </Box>
            </Group>
            <Box component="pre" className={classes.diff}>
                <span data-kind="context">{'  - name: amount\n'}</span>
                <span data-kind="add">{'+   meta:\n'}</span>
                <span data-kind="add">{'+     metrics:\n'}</span>
                <span data-kind="add">
                    {'+       total_revenue: { type: sum }'}
                </span>
            </Box>
        </Box>
        <Text
            fz="xs"
            c="dimmed"
            className={classes.cardNote}
            __vars={{ '--i': '6' }}
        >
            Aurora proposes model changes as pull requests you review.
        </Text>
    </Figure>
);

const WelcomeVisual: FC = () => (
    <Figure
        title="Ask in plain English"
        body="Aurora writes the query, picks the chart and tells you what it found, with the definitions it used."
    >
        <Box className={classes.question} __vars={{ '--i': '0' }}>
            What drove revenue last quarter?
        </Box>
        <Box className={classes.answer} __vars={{ '--i': '1' }}>
            <Group gap={6} wrap="nowrap">
                <AuroraMark />
                <Text fz="xs" fw={500}>
                    Aurora
                </Text>
            </Group>
            <Text fz="xs" mt={6}>
                Revenue grew 22%, mostly from returning customers in the US.
            </Text>
            <Bars heights={[30, 45, 60, 52, 80, 92]} delay={2} />
            <Group gap={4} mt={8}>
                <Text fz="xs" c="dimmed">
                    Used
                </Text>
                <Box className={classes.chip} data-kind="metric">
                    total_revenue
                </Box>
                <Box className={classes.chip} data-kind="dimension">
                    customer_type
                </Box>
            </Group>
        </Box>
    </Figure>
);

export type OnboardingVisualStep = 'welcome' | 'warehouse' | 'tools' | 'team';

export const StepVisual: FC<{ step: OnboardingVisualStep }> = ({ step }) => {
    switch (step) {
        case 'welcome':
            return <WelcomeVisual />;
        case 'warehouse':
            return <WarehouseVisual />;
        case 'tools':
            return <ToolsVisual warehouse={null} />;
        case 'team':
            return <TeamVisual />;
        default: {
            const unreachable: never = step;
            return unreachable;
        }
    }
};
