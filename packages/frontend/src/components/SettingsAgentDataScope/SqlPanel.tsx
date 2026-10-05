import { Button, Group, Stack, Text } from '@mantine/core';
import CodeBlock from '../common/CodeBlock/CodeBlock';

export const SqlPanel = ({
    sql,
    summary,
    language = 'sql',
    filename = 'ai-boundary.sql',
}: {
    sql: string;
    summary: string;
    language?: 'sql' | 'bash';
    filename?: string;
}) => (
    <Stack gap="xs">
        <Text size="sm">{summary}</Text>
        <CodeBlock
            code={sql}
            language={language}
            withExpandButton
            maxCollapsedHeight={240}
            defaultExpanded={false}
        />
        {language === 'sql' && sql.split('\n').length > 30 && (
            <Group justify="flex-end">
                <Button
                    component="a"
                    href={`data:application/sql;charset=utf-8,${encodeURIComponent(sql)}`}
                    download={filename}
                    size="xs"
                    variant="default"
                >
                    Download .sql
                </Button>
            </Group>
        )}
    </Stack>
);
