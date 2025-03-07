import {
    type CompiledDimension,
    type DateGranularity,
} from '@lightdash/common';
import { Text, Tooltip } from '@mantine/core';
import { IconCalendarSearch } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    dateZoomGranularity: DateGranularity;
    dateDimension: Pick<CompiledDimension, 'label' | 'name'>;
};

export const DateZoomInfoOnTile: FC<Props> = ({
    dateZoomGranularity,
    dateDimension,
}) => {
    return (
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
            <MantineIcon
                icon={IconCalendarSearch}
                color="blue"
                size={20}
                style={{ flexShrink: 0 }}
            />
        </Tooltip>
    );
};
