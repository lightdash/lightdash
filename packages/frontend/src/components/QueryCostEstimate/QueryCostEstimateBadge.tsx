import {
    formatEstimatedBytes,
    type QueryCostEstimate,
} from '@lightdash/common';
import { Badge, Loader, Tooltip } from '@mantine/core';
import { IconDatabase } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

const UNDERREPORT_NOTE =
    'Dry runs can underreport tables with row-level security or external data.';

type Props = {
    estimate: QueryCostEstimate | undefined;
    isFetching: boolean;
};

export const QueryCostEstimateBadge: FC<Props> = ({ estimate, isFetching }) => {
    if (!estimate) {
        return isFetching ? <Loader size="xs" /> : null;
    }
    switch (estimate.status) {
        case 'unavailable':
            return null;
        case 'error':
            return (
                <Tooltip
                    label={estimate.message}
                    multiline
                    maw={360}
                    withinPortal
                >
                    <Badge
                        leftSection={<MantineIcon icon={IconDatabase} />}
                        color="gray"
                    >
                        Estimate unavailable
                    </Badge>
                </Tooltip>
            );
        case 'estimated':
            return (
                <Tooltip
                    label={`Estimated ${formatEstimatedBytes(
                        estimate.totalBytesProcessed,
                    )} processed, from a free dry run. ${UNDERREPORT_NOTE}`}
                    multiline
                    maw={360}
                    withinPortal
                >
                    <Badge
                        leftSection={<MantineIcon icon={IconDatabase} />}
                        color={
                            estimate.requiresConfirmation ? 'orange' : 'gray'
                        }
                        opacity={isFetching ? 0.6 : 1}
                        data-testid="query-cost-estimate-badge"
                    >
                        ~{formatEstimatedBytes(estimate.totalBytesProcessed)}
                    </Badge>
                </Tooltip>
            );
        default:
            return null;
    }
};
