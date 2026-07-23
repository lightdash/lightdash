import { ActionIcon, Tooltip } from '@mantine-8/core';
import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    collapsed: boolean;
    onToggle: () => void;
};

const AppBuilderSidebarToggle: FC<Props> = ({ collapsed, onToggle }) => {
    const label = collapsed ? 'Show build panel' : 'Hide build panel';

    return (
        <Tooltip label={label} withArrow position="right">
            <ActionIcon
                variant="subtle"
                size="sm"
                color="ldGray.6"
                onClick={onToggle}
                aria-label={label}
            >
                <MantineIcon
                    icon={
                        collapsed
                            ? IconLayoutSidebarLeftExpand
                            : IconLayoutSidebarLeftCollapse
                    }
                    size={16}
                />
            </ActionIcon>
        </Tooltip>
    );
};

export default AppBuilderSidebarToggle;
