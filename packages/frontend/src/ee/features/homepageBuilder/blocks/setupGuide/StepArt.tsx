import { ApiConnectorType } from '@lightdash/common';
import { Box } from '@mantine/core';
import {
    IconDatabase,
    IconGitPullRequest,
    IconPlus,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
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
    'starter-dashboard': () => (
        <Box className={classes.board}>
            <Box className={classes.kpi}>$1.2M</Box>
            <Box className={classes.kpi}>151</Box>
            <Box className={classes.wide}>
                <Bars heights={[40, 62, 50, 78, 92]} />
            </Box>
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
                    @Aurora
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
