import {
    assertUnreachable,
    PreAggregateMissReason,
    preAggregateMissReasonLabels,
} from '@lightdash/common';
import { ThemeIcon, Tooltip } from '@mantine-8/core';
import { IconBolt, IconBoltOff } from '@tabler/icons-react';
import { memo, useMemo, type FC } from 'react';
import {
    selectPreAggEnabled,
    selectPreAggregateMatchResult,
    useExplorerSelector,
} from '../features/explorer/store';
import { usePreAggregateCacheEnabled } from '../hooks/usePreAggregateCacheEnabled';

const PreAggregateStatusBadge: FC = memo(() => {
    const matchResult = useExplorerSelector(selectPreAggregateMatchResult);
    const preAggEnabled = useExplorerSelector(selectPreAggEnabled);
    const [preAggCacheEnabled] = usePreAggregateCacheEnabled();

    const status = useMemo<{
        color: string;
        tooltip: string;
        icon: 'bolt' | 'bolt-off';
    } | null>(() => {
        if (!preAggEnabled || !matchResult) return null;

        // User bypass: match exists but user disabled cache
        if (
            !matchResult.hit &&
            matchResult.miss?.reason === PreAggregateMissReason.USER_BYPASS
        ) {
            return {
                color: 'yellow',
                tooltip: 'Pre-aggregate bypassed by user',
                icon: 'bolt-off',
            };
        }

        const hitStatus = matchResult.hit ? 'hit' : 'miss';
        const cacheStatus = preAggCacheEnabled ? 'enabled' : 'disabled';
        const combined = `${hitStatus}_${cacheStatus}` as const;

        switch (combined) {
            case 'hit_enabled':
                return {
                    color: 'green',
                    tooltip: `Pre-aggregate cache active: ${matchResult.preAggregateName}`,
                    icon: 'bolt',
                };
            case 'hit_disabled':
                return {
                    color: 'yellow',
                    tooltip: 'Pre-aggregate cache available but disabled',
                    icon: 'bolt-off',
                };
            case 'miss_enabled': {
                const reason = matchResult.miss
                    ? preAggregateMissReasonLabels[matchResult.miss.reason]
                    : 'No match';
                return {
                    color: 'gray',
                    tooltip: `Cache miss: ${reason}`,
                    icon: 'bolt',
                };
            }
            case 'miss_disabled':
                return null;
            default:
                return assertUnreachable(
                    combined,
                    'Unexpected pre-aggregate status',
                );
        }
    }, [preAggEnabled, matchResult, preAggCacheEnabled]);

    if (!status) return null;

    const Icon = status.icon === 'bolt-off' ? IconBoltOff : IconBolt;

    return (
        <Tooltip
            label={status.tooltip}
            position="bottom"
            withArrow
            withinPortal
        >
            <ThemeIcon
                size="xs"
                radius="xl"
                color={status.color}
                pos="absolute"
                top={-6}
                right={-6}
                style={{ zIndex: 1 }}
            >
                <Icon size={10} />
            </ThemeIcon>
        </Tooltip>
    );
});

export default PreAggregateStatusBadge;
