import { ApiConnectorType } from '@lightdash/common';
import { Box } from '@mantine/core';
import {
    IconDatabase,
    IconGitPullRequest,
    IconPlus,
    IconSparkles,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { AI_NAME } from '../../../../../components/common/aiName';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { LiveSourceIcon } from '../../../../../features/externalConnections/liveSources/LiveSourceIcon';
import SlackSvg from '../../../../../svgs/slack.svg?react';
import { type SetupGuideRowId } from './setupGuideModel';
import classes from './StepArt.module.css';

const Bars: FC<{ heights: number[] }> = ({ heights }) => (
    <Box className={classes.bars}>
        {heights.map((height, index) => (
            <Box
                key={index}
                className={classes.bar}
                __vars={{ '--h': `${height}%`, '--i': String(index) }}
            />
        ))}
    </Box>
);

const ChartCard: FC = () => (
    <Box className={classes.chartCard}>
        <Box className={classes.line} data-strong>
            Orders by month
        </Box>
        <Bars heights={[34, 48, 42, 60, 56, 74, 92]} />
    </Box>
);

const SCENES: Record<SetupGuideRowId, () => ReactNode> = {
    warehouse: () => (
        <Box className={classes.sheet}>
            {['orders', 'customers', 'payments'].map((name) => (
                <Box key={name} className={classes.line}>
                    <MantineIcon icon={IconDatabase} size={10} />
                    {name}
                </Box>
            ))}
        </Box>
    ),
    'app-data': () => (
        <Box className={classes.tiles}>
            {[
                ApiConnectorType.POSTHOG,
                ApiConnectorType.GA4,
                ApiConnectorType.SEARCH_CONSOLE,
            ].map((connector) => (
                <Box key={connector} className={classes.tile}>
                    <LiveSourceIcon connector={connector} size={16} />
                </Box>
            ))}
        </Box>
    ),
    'semantic-layer': () => (
        <Box className={classes.model}>
            <Box className={classes.sheet}>
                <Box className={classes.line} data-strong>
                    <MantineIcon icon={IconDatabase} size={10} />
                    orders
                </Box>
                <Box className={classes.field} data-kind="metric">
                    total_revenue
                </Box>
                <Box className={classes.field} data-kind="dimension">
                    order_date
                </Box>
                <Box className={classes.field} data-kind="dimension">
                    status
                </Box>
            </Box>
            <Box className={classes.metricCard}>
                <Box className={classes.line}>Total revenue</Box>
                <Box className={classes.metricValue}>$1.2M</Box>
                <Bars heights={[38, 55, 47, 72, 90]} />
            </Box>
        </Box>
    ),
    'first-chart': () => (
        <Box className={classes.build}>
            <Box className={classes.bubble} data-ask>
                <MantineIcon icon={IconSparkles} size={10} />
                orders by month?
            </Box>
            <ChartCard />
            <Box className={classes.sheet} data-fields data-labels>
                <Box className={classes.field} data-kind="metric">
                    Order count
                </Box>
                <Box className={classes.field} data-kind="dimension">
                    Order month
                </Box>
            </Box>
        </Box>
    ),
    'source-control': () => (
        <Box className={classes.sheet}>
            <Box className={classes.line} data-strong>
                <MantineIcon icon={IconGitPullRequest} size={10} />
                Add revenue metric
            </Box>
            <Box className={classes.diff}>+ type: sum</Box>
            <Box className={classes.diff}>+ format: usd</Box>
        </Box>
    ),
    brand: () => (
        <Box className={classes.palette}>
            <Box className={classes.type}>Aa</Box>
            {['#7262ff', '#1f2937', '#f59f00', '#12b886'].map((hex) => (
                <Box key={hex} className={classes.dot} bg={hex} />
            ))}
        </Box>
    ),
    slack: () => (
        <Box className={classes.thread}>
            <Box className={classes.bubble}>
                <SlackSvg width={12} height={12} />
                <Box component="span" className={classes.mention}>
                    @{AI_NAME}
                </Box>
                how did revenue do?
            </Box>
            <Box className={classes.bubble} data-reply>
                <Box className={classes.auroraDot} />
                Up 18% this week
            </Box>
        </Box>
    ),
    'invite-team': () => (
        <Box className={classes.avatars}>
            {['S', 'M', 'R', 'J'].map((initial, index) => (
                <Box key={initial} className={classes.avatar} data-tone={index}>
                    {initial}
                </Box>
            ))}
            <Box className={classes.avatar} data-add>
                <MantineIcon icon={IconPlus} size={11} />
            </Box>
        </Box>
    ),
};

export const StepArt: FC<{
    id: SetupGuideRowId;
    badge: string | null;
    size: 'sm' | 'lg';
}> = ({ id, badge, size }) => (
    <Box className={classes.band} data-size={size} aria-hidden>
        {badge && <Box className={classes.badge}>{badge}</Box>}
        <Box className={classes.scene}>{SCENES[id]()}</Box>
    </Box>
);

const CHOICE_SCENES: Record<'ask' | 'explore', () => ReactNode> = {
    ask: () => (
        <Box className={classes.thread}>
            <Box className={classes.bubble} data-question>
                orders by month?
            </Box>
            <Box className={classes.bubble} data-reply>
                <Box className={classes.auroraDot} />
                <Bars heights={[40, 55, 48, 70, 92]} />
            </Box>
        </Box>
    ),
    explore: () => (
        <Box className={classes.model}>
            <Box className={classes.sheet} data-labels>
                <Box className={classes.field} data-kind="metric" data-picked>
                    Order count
                </Box>
                <Box
                    className={classes.field}
                    data-kind="dimension"
                    data-picked
                >
                    Order month
                </Box>
                <Box className={classes.field} data-kind="dimension">
                    Status
                </Box>
            </Box>
            <Box className={classes.metricCard}>
                <Bars heights={[40, 55, 48, 70, 92]} />
            </Box>
        </Box>
    ),
};

export const ChoiceArt: FC<{ kind: 'ask' | 'explore' }> = ({ kind }) => (
    <Box className={classes.band} data-size="choice" aria-hidden>
        <Box className={classes.scene}>{CHOICE_SCENES[kind]()}</Box>
    </Box>
);
