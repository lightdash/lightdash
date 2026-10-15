import { Button, Menu } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';

type Props = {
    size?: 'md' | 'xs';
};

/**
 * Reusable button for adding new custom roles that includes a menu to decide between creating
 * a new role or duplicating an existing one.
 */
export const AddRoleButton: FC<Props> = ({ size = 'md' }) => {
    const { t } = useTranslation('customRoles');
    return (
        <Menu position="bottom-end">
            <Menu.Target>
                <Button
                    size={size}
                    leftSection={<MantineIcon icon={IconPlus} />}
                >
                    {t('addRole.button')}
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Item
                    component={Link}
                    to="/generalSettings/customRoles/create"
                >
                    {t('addRole.create')}
                </Menu.Item>
                <Menu.Item
                    component={Link}
                    to="/generalSettings/customRoles/duplicate"
                >
                    {t('addRole.duplicate')}
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};
