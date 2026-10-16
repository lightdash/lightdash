import { Menu, Text } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';

const MANAGE_THEMES_ROUTE = '/generalSettings/dataApps/themes';

/** Trailing entry of a theme list: opens organization theme settings. */
export const ManageThemesMenuItem: FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation('settings');
    return (
        <Menu.Item
            leftSection={<MantineIcon icon={IconSettings} size={14} />}
            onClick={() => void navigate(MANAGE_THEMES_ROUTE)}
        >
            <Text size="xs">{t('designs.picker.manageThemes')}</Text>
        </Menu.Item>
    );
};
