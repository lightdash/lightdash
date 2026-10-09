import { formatSql, type WarehouseTypes } from '@lightdash/common';
import { Box } from '@mantine/core';
import { useMemo, type FC } from 'react';
import CodeBlock from '../../../../../../components/common/CodeBlock/CodeBlock';
import styles from './ToolCallSqlBlock.module.css';

type ToolCallSqlBlockProps = {
    sql: string;
    dialect?: WarehouseTypes;
};

/** Formatted, scrollable SQL for a tool call row body. */
export const ToolCallSqlBlock: FC<ToolCallSqlBlockProps> = ({
    sql,
    dialect,
}) => {
    const formattedSql = useMemo(() => formatSql(sql, dialect), [sql, dialect]);
    return (
        <Box className={styles.code}>
            <CodeBlock code={formattedSql} language="sql" />
        </Box>
    );
};
