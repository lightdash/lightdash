import { Menu, Text } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { MANAGE_THEMES_ROUTE } from '../themeCopy';

/** Trailing entry of a theme list: opens organization theme settings. */
export const ManageThemesMenuItem: FC = () => {
    const navigate = useNavigate();
    return (
        <Menu.Item
            leftSection={<MantineIcon icon={IconSettings} size={14} />}
            onClick={() => void navigate(MANAGE_THEMES_ROUTE)}
        >
            <Text size="xs">Manage themes</Text>
        </Menu.Item>
    );
};
