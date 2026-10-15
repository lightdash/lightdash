import { Tooltip } from '@mantine/core';
import { IconCirclePlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { SidebarButton } from './SidebarButton';

type Props = {
    to: string;
    isCollapsed: boolean;
};

export const NewThreadButton: FC<Props> = ({ to, isCollapsed }) => {
    const { t } = useTranslation('aiAgent');
    return (
        <Tooltip
            label={t('layout.newThread')}
            disabled={!isCollapsed}
            position="right"
        >
            <SidebarButton
                aria-label={t('layout.newThread')}
                leftSection={<MantineIcon icon={IconCirclePlus} />}
                component={Link}
                to={to}
                size="xs"
                {...(!isCollapsed && {
                    fullWidth: true,
                    justify: 'flex-start',
                })}
            >
                {isCollapsed ? '' : t('layout.newThread')}
            </SidebarButton>
        </Tooltip>
    );
};
