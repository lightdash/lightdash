import { ActionIcon, Tooltip } from '@mantine/core';
import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    collapsed: boolean;
    onToggle: () => void;
};

const AppBuilderSidebarToggle: FC<Props> = ({ collapsed, onToggle }) => {
    const { t } = useTranslation('apps');
    const label = collapsed ? t('builder.showPanel') : t('builder.hidePanel');

    return (
        <Tooltip label={label} position="right">
            <ActionIcon size="md" onClick={onToggle} aria-label={label}>
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
