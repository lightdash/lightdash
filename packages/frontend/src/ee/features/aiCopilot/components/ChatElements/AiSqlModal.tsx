import { formatSql } from '@lightdash/common';
import { Box, Button, CopyButton } from '@mantine/core';
import { IconCheck, IconCopy, IconEye } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import CodeBlock from '../../../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import classes from './AiSqlModal.module.css';

type Props = {
    sql: string;
    opened: boolean;
    onClose: () => void;
};

const AiSqlCode: FC<{ sql: string }> = ({ sql }) => {
    const formattedSql = useMemo(() => formatSql(sql).trim(), [sql]);
    const lineNumbers = Array.from(
        { length: formattedSql.split('\n').length },
        (_, index) => index + 1,
    ).join('\n');

    return (
        <Box className={classes.viewer}>
            <code aria-hidden className={classes.lineNumbers}>
                {lineNumbers}
            </code>
            <CodeBlock
                code={formattedSql}
                language="sql"
                background="ldGray.0"
                withCopyButton={false}
            />
        </Box>
    );
};

export const AiSqlModal: FC<Props> = ({ sql, opened, onClose }) => {
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="SQL"
            icon={IconEye}
            size="xl"
            headerActions={
                <CopyButton value={sql}>
                    {({ copied, copy }) => (
                        <Button
                            variant="default"
                            size="xs"
                            leftSection={
                                <MantineIcon
                                    icon={copied ? IconCheck : IconCopy}
                                />
                            }
                            onClick={copy}
                        >
                            {copied ? 'Copied' : 'Copy SQL'}
                        </Button>
                    )}
                </CopyButton>
            }
        >
            <AiSqlCode sql={sql} />
        </MantineModal>
    );
};
