import { Tooltip } from '@mantine/core';
import { IconCirclePlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { SidebarButton } from './SidebarButton';

type Props = {
    to: string;
    isCollapsed: boolean;
};

export const NewThreadButton: FC<Props> = ({ to, isCollapsed }) => (
    <Tooltip label="New thread" disabled={!isCollapsed} position="right">
        <SidebarButton
            aria-label="New thread"
            leftSection={<MantineIcon icon={IconCirclePlus} />}
            component={Link}
            to={to}
            size="xs"
            {...(!isCollapsed && {
                fullWidth: true,
                justify: 'flex-start',
            })}
        >
            {isCollapsed ? '' : 'New thread'}
        </SidebarButton>
    </Tooltip>
);
