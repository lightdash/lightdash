import { ActionIcon, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconEye } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import CodeBlock from '../../../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';

interface ViewSqlButtonProps {
    sql?: string;
}

export const ViewSqlButton: FC<ViewSqlButtonProps> = memo(({ sql }) => {
    const [opened, { open, close }] = useDisclosure(false);

    if (!sql) return null;

    return (
        <>
            <Tooltip label="View SQL" position="top">
                <ActionIcon size="sm" color="ldGray.9" onClick={open}>
                    <MantineIcon icon={IconEye} />
                </ActionIcon>
            </Tooltip>
            <MantineModal
                opened={opened}
                onClose={close}
                title="SQL"
                icon={IconEye}
                size="xl"
            >
                <CodeBlock code={sql} language="sql" withLineNumbers />
            </MantineModal>
        </>
    );
});
