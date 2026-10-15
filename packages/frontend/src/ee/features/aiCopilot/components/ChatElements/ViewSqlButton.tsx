import { ActionIcon, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconEye } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { AiSqlModal } from './AiSqlModal';

interface ViewSqlButtonProps {
    sql?: string;
}

export const ViewSqlButton: FC<ViewSqlButtonProps> = memo(({ sql }) => {
    const { t } = useTranslation('aiCopilotChat');
    const [opened, { open, close }] = useDisclosure(false);

    if (!sql) return null;

    return (
        <>
            <Tooltip label={t('chartOptions.viewSql')} position="top">
                <ActionIcon
                    size="sm"
                    color="ldGray.9"
                    aria-label={t('chartOptions.viewSql')}
                    onClick={open}
                >
                    <MantineIcon icon={IconEye} />
                </ActionIcon>
            </Tooltip>
            <AiSqlModal opened={opened} onClose={close} sql={sql} />
        </>
    );
});
