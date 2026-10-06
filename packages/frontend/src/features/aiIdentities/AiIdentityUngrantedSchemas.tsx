import { type AiIdentityUngrantedSchemas as UngrantedSchemas } from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import Callout from '../../components/common/Callout';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';

export const AiIdentityUngrantedSchemas = ({
    entries,
}: {
    entries: UngrantedSchemas[];
}) => (
    <>
        {entries.map(({ roleName, schemas, fixSql }) => (
            <Callout
                key={roleName}
                variant="warning"
                title={`${schemas.length} new ${schemas.length === 1 ? 'schema is' : 'schemas are'} not granted to ${roleName}`}
            >
                <Stack gap="xs">
                    <Text size="sm">
                        Run this SQL as an admin role in Snowflake. The
                        provisioner cannot grant access to schemas that it does
                        not own. Until you run it, the AI cannot read these
                        schemas.
                    </Text>
                    <Stack gap={2} mah={200} style={{ overflowY: 'auto' }}>
                        {schemas.map((schema) => (
                            <Text size="sm" key={schema}>
                                {schema}
                            </Text>
                        ))}
                    </Stack>
                    <CodeBlock code={fixSql} language="sql" withExpandButton />
                    <Button
                        component="a"
                        variant="default"
                        href={`data:application/sql;charset=utf-8,${encodeURIComponent(fixSql)}`}
                        download="ai-schema-grants.sql"
                    >
                        Download .sql
                    </Button>
                </Stack>
            </Callout>
        ))}
    </>
);
