import { Tooltip } from '@mantine-8/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    paramKey: string;
};

export const ShadowedReservedNameWarning: FC<Props> = ({ paramKey }) => (
    <Tooltip
        withinPortal
        position="top"
        maw={350}
        label={`Parameter ${paramKey} overrides the system variable of the same name and takes priority over it.`}
    >
        <MantineIcon size="sm" icon={IconAlertTriangle} color="yellow.7" />
    </Tooltip>
);
