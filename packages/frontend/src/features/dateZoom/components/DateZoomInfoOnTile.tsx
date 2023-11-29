import { CompiledDimension } from '@lightdash/common';
import { Text, Tooltip } from '@mantine/core';
import { IconCalendarSearch } from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useDashboardContext } from '../../../providers/DashboardProvider';

type Props = {
    chartUuid: string | null;
    dateDimension: Pick<CompiledDimension, 'label' | 'name'>;
};

export const DateZoomInfoOnTile: FC<Props> = ({ chartUuid, dateDimension }) => {
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const chartsWithDateZoomApplied = useDashboardContext(
        (c) => c.chartsWithDateZoomApplied,
    );

    return chartUuid &&
        dateZoomGranularity &&
        chartsWithDateZoomApplied?.has(chartUuid) ? (
        <Tooltip
            label={
                <>
                    <Text fz="xs">
                        Date zoom:{' '}
                        <Text span fw={500}>
                            {dateZoomGranularity}
                        </Text>
                    </Text>
                    <Text fz="xs">
                        On:{' '}
                        <Text span fw={500}>
                            {dateDimension?.label}
                        </Text>
                    </Text>
                </>
            }
            disabled={!dateDimension}
            multiline
            withinPortal
        >
            <MantineIcon icon={IconCalendarSearch} color="blue" />
        </Tooltip>
    ) : null;
};
