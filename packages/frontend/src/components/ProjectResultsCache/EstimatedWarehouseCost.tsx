import { Divider, Stack, Text, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import { useWarehouseCostRate } from './useWarehouseCostRate';
import {
    formatApproxUsd,
    formatCostFormula,
    getDisplayedCostUsd,
    type WarehouseCostRate,
    type WarehouseUsage,
} from './warehouseCostEstimate';

export const WarehouseCostTooltipContent: FC<{
    usage: WarehouseUsage;
    rate: WarehouseCostRate;
}> = ({ usage, rate }) => (
    <Stack gap="xs">
        <Text fz="xs">{`Assumes ${rate.assumption}`}</Text>
        <Text fz="xs" fw={500}>
            {formatCostFormula(usage, rate)}
        </Text>
    </Stack>
);

type Props = {
    projectUuid: string;
    usage: WarehouseUsage;
};

export const EstimatedWarehouseCost: FC<Props> = ({ projectUuid, usage }) => {
    const rate = useWarehouseCostRate(projectUuid);
    const usd = rate ? getDisplayedCostUsd(usage, rate) : null;
    if (!rate || usd === null) return null;

    return (
        <>
            <Divider orientation="vertical" />
            <Tooltip
                multiline
                maw={320}
                withinPortal
                label={
                    <WarehouseCostTooltipContent usage={usage} rate={rate} />
                }
            >
                <Text fz="sm">{`${formatApproxUsd(usd)} cost saved`}</Text>
            </Tooltip>
        </>
    );
};
