import { Tooltip } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { type FC } from 'react';
import { InfoContainer } from '.';

interface ViewInfoProps {
    views?: number;
    firstViewedAt?: Date | string | null;
}

const ViewInfo: FC<ViewInfoProps> = ({ views, firstViewedAt }) => {
    const label = firstViewedAt
        ? `${views} views since ${dayjs(firstViewedAt).format(
              'MMM D, YYYY h:mm A',
          )}`
        : undefined;

    return (
        <Tooltip
            position="top-start"
            label={label}
            disabled={!views || !firstViewedAt}
        >
            <InfoContainer>
                <IconEye size={16} />
                <span>{views || '0'} views</span>
            </InfoContainer>
        </Tooltip>
    );
};

export default ViewInfo;
