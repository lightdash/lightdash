import { Box, Group } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { BetaBadge } from '../../../components/common/BetaBadge';
import { isLiveSourceBeta } from './liveSourceBeta';

const TOOLTIP = 'In beta, so queries and fields may still change';

/** The Beta badge on every surface that names a live data source. */
export const LiveSourceBetaBadge: FC = () =>
    isLiveSourceBeta ? (
        // Never squeezed by a truncating label next to it.
        <Box component="span" display="inline-flex" flex="none">
            <BetaBadge tooltipLabel={TOOLTIP} />
        </Box>
    ) : null;

/** A title followed by the live data source Beta badge. */
export const LiveSourceBetaTitle: FC<{ children: ReactNode }> = ({
    children,
}) =>
    isLiveSourceBeta ? (
        <Group component="span" gap={8} wrap="nowrap" display="inline-flex">
            {children}
            <LiveSourceBetaBadge />
        </Group>
    ) : (
        <>{children}</>
    );
