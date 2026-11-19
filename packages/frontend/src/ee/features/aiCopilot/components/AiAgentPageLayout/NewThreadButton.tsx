import { IconCirclePlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { SidebarButton } from './SidebarButton';

type Props = {
    to: string;
};

export const NewThreadButton: FC<Props> = ({ to }) => (
    <SidebarButton
        leftSection={<MantineIcon icon={IconCirclePlus} />}
        component={Link}
        to={to}
        size="xs"
        fz="sm"
        fullWidth
        justify="flex-start"
    >
        New thread
    </SidebarButton>
);
