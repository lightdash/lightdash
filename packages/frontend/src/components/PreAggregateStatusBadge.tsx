import { PreAggregateMissReason } from '@lightdash/common';
import { ThemeIcon, Tooltip } from '@mantine/core';
import { IconBolt, IconBoltOff } from '@tabler/icons-react';
import { memo, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    selectPreAggVisible,
    selectPreAggregateCheck,
    useExplorerSelector,
} from '../features/explorer/store';
import { useExplorerQuery } from '../hooks/useExplorerQuery';
import { usePreAggregateCacheEnabled } from '../hooks/usePreAggregateCacheEnabled';
import { formatTileMissReason } from './common/Dashboard/PreAggregateAuditIndicator.utils';

const PreAggregateStatusBadge: FC = memo(() => {
    const { t } = useTranslation('app');
    const preAggregateCheck = useExplorerSelector(selectPreAggregateCheck);
    const preAggVisible = useExplorerSelector(selectPreAggVisible);
    const [preAggCacheEnabled] = usePreAggregateCacheEnabled();
    const { queryResults } = useExplorerQuery();
    // Post-execution truth from the latest results: non-null fallbackReason
    // means the pre-aggregate matched but results came from the warehouse
    const resultsPreAggregate = queryResults.metadata?.preAggregate;

    const status = useMemo<{
        color: string;
        tooltip: string;
        icon: 'bolt' | 'bolt-off';
    } | null>(() => {
        if (!preAggVisible) return null;

        if (preAggregateCheck.status === 'error') {
            return {
                color: 'red',
                tooltip: preAggregateCheck.message,
                icon: 'bolt-off',
            };
        }

        if (preAggregateCheck.status !== 'ready') {
            return null;
        }

        const { result } = preAggregateCheck;

        if (result.hit) {
            if (resultsPreAggregate?.fallbackReason != null) {
                return {
                    color: 'orange',
                    tooltip: t('preAggregateStatusBadge.fallback', {
                        name: result.preAggregateName,
                    }),
                    icon: 'bolt-off',
                };
            }
            return {
                color: 'green',
                tooltip: t('preAggregateStatusBadge.active', {
                    name: result.preAggregateName,
                }),
                icon: 'bolt',
            };
        }

        if (
            !preAggCacheEnabled &&
            result.reason.reason === PreAggregateMissReason.USER_BYPASS
        ) {
            return {
                color: 'yellow',
                tooltip: t('preAggregateStatusBadge.bypassed'),
                icon: 'bolt-off',
            };
        }

        if (!preAggCacheEnabled) {
            return null;
        }

        return {
            color: 'gray',
            tooltip: t('preAggregateStatusBadge.miss', {
                reason: formatTileMissReason(result.reason),
            }),
            icon: 'bolt',
        };
    }, [
        preAggVisible,
        preAggregateCheck,
        preAggCacheEnabled,
        resultsPreAggregate,
        t,
    ]);

    if (!status) return null;

    const Icon = status.icon === 'bolt-off' ? IconBoltOff : IconBolt;

    return (
        <Tooltip label={status.tooltip} position="bottom">
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
