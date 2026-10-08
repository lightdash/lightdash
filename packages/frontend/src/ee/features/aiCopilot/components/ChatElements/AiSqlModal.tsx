import { formatSql } from '@lightdash/common';
import { Box, Button, CopyButton } from '@mantine/core';
import {
    IconCheck,
    IconCopy,
    IconEye,
    type Icon as IconType,
} from '@tabler/icons-react';
import { useMemo, type FC, type ReactNode } from 'react';
import CodeBlock from '../../../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import classes from './AiSqlModal.module.css';

type Props = {
    sql: string;
    opened: boolean;
    onClose: () => void;
    title?: string;
    icon?: IconType;
    subtitle?: ReactNode;
    /** Replaces the default (empty) footer, e.g. with approval actions. */
    footer?: ReactNode;
    /** `inline` puts the copy icon inside the code block, as chat code blocks do. */
    copyPlacement?: 'header' | 'inline';
};

const AiSqlCode: FC<{ sql: string; withCopyButton: boolean }> = ({
    sql,
    withCopyButton,
}) => {
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
                withCopyButton={withCopyButton}
            />
        </Box>
    );
};

export const AiSqlModal: FC<Props> = ({
    sql,
    opened,
    onClose,
    title = 'SQL',
    icon = IconEye,
    subtitle,
    footer,
    copyPlacement = 'header',
}) => {
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={title}
            icon={icon}
            subtitle={subtitle}
            footer={footer}
            size="xl"
            headerActions={
                copyPlacement === 'header' ? (
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
                ) : null
            }
        >
            <AiSqlCode sql={sql} withCopyButton={copyPlacement === 'inline'} />
        </MantineModal>
    );
};
