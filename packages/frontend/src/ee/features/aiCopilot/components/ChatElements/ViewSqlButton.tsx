import { ActionIcon, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconEye } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { AiSqlModal } from './AiSqlModal';

interface ViewSqlButtonProps {
    sql?: string;
}

export const ViewSqlButton: FC<ViewSqlButtonProps> = memo(({ sql }) => {
    const [opened, { open, close }] = useDisclosure(false);

    if (!sql) return null;

    return (
        <>
            <Tooltip label="View SQL" position="top">
                <ActionIcon
                    size="sm"
                    color="ldGray.9"
                    aria-label="View SQL"
                    onClick={open}
                >
                    <MantineIcon icon={IconEye} />
                </ActionIcon>
            </Tooltip>
            <AiSqlModal opened={opened} onClose={close} sql={sql} />
        </>
    );
});
