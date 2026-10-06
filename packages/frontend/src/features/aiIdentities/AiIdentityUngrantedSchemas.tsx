import {
    type AiIdentitySyncIssue,
    type AiIdentityUngrantedSchemas as UngrantedSchemas,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import Callout from '../../components/common/Callout';

export const AiIdentityUngrantedSchemas = ({
    entries,
    issues = [],
}: {
    entries: UngrantedSchemas[];
    issues?: AiIdentitySyncIssue[];
}) => (
    <>
        {entries.map(({ roleName, schemas }) => (
            <Callout
                key={roleName}
                variant="info"
                title={`${schemas.length} new ${schemas.length === 1 ? 'schema waits' : 'schemas wait'} for the next grant sync`}
            >
                <Text size="sm">{roleName}</Text>
                {issues
                    .filter(
                        (issue) =>
                            issue.roleName?.toUpperCase() ===
                                roleName.toUpperCase() &&
                            schemas.some(
                                (schema) =>
                                    schema.toUpperCase() ===
                                    `${issue.database}.${issue.schema}`.toUpperCase(),
                            ),
                    )
                    .map((issue) => (
                        <Callout
                            key={`${issue.code}-${issue.database}-${issue.schema}`}
                            variant="warning"
                            title="Grant sync issue"
                        >
                            {issue.message}
                        </Callout>
                    ))}
                <Stack gap={2} mah={200} style={{ overflowY: 'auto' }}>
                    {schemas.map((schema) => (
                        <Text size="sm" key={schema}>
                            {schema}
                        </Text>
                    ))}
                </Stack>
            </Callout>
        ))}
    </>
);
