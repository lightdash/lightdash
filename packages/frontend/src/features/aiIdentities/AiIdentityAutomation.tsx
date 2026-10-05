import { type AiIdentityAccount } from '@lightdash/common';
import { Paper, Stack, Tabs, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';

export const AiIdentityAutomation: FC<{ account: AiIdentityAccount }> = ({
    account,
}) => {
    const endpoint =
        '$LIGHTDASH_URL/api/v2/org/ai-identities?aiIdentityAccountUuid=' +
        account.aiIdentityAccountUuid +
        '&state=pending';
    return (
        <Stack gap="lg">
            <Paper p="md">
                <Stack gap="sm">
                    <Title order={5}>Provisioning API</Title>
                    <Text fz="sm" c="dimmed">
                        Use a service account or personal access token. The
                        pending JSON export has an identities array with the
                        same names and public keys, plus a skipped array for
                        people without a Snowflake login.
                    </Text>
                    <Tabs defaultValue="curl">
                        <Tabs.List>
                            <Tabs.Tab value="curl">curl</Tabs.Tab>
                            <Tabs.Tab value="json">JSON</Tabs.Tab>
                        </Tabs.List>
                        <Tabs.Panel value="curl" pt="sm">
                            <CodeBlock
                                language="bash"
                                code={`curl \\\n  -H 'Authorization: ApiKey $LIGHTDASH_API_KEY' \\\n  '${endpoint}'`}
                            />
                        </Tabs.Panel>
                        <Tabs.Panel value="json" pt="sm">
                            <CodeBlock
                                language="json"
                                code={JSON.stringify(
                                    {
                                        identities: [
                                            {
                                                email: 'person@example.com',
                                                snowflakeLogin: 'PERSON',
                                                twinName: 'PERSON_AI',
                                                publicKey: '<public key>',
                                                state: 'pending',
                                            },
                                        ],
                                        skipped: [],
                                    },
                                    null,
                                    2,
                                )}
                            />
                        </Tabs.Panel>
                    </Tabs>
                </Stack>
            </Paper>
            <Paper p="md">
                <Stack gap="sm">
                    <Title order={5}>Check identities</Title>
                    <CodeBlock
                        language="bash"
                        code={`curl -X POST \\\n  -H 'Authorization: ApiKey $LIGHTDASH_API_KEY' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"filter":{"aiIdentityAccountUuid":"${account.aiIdentityAccountUuid}","states":[],"reasons":[],"projectUuid":null,"search":null,"staleOnly":false}}' \\\n  '$LIGHTDASH_URL/api/v2/org/ai-identities/bulk-test'`}
                    />
                </Stack>
            </Paper>
        </Stack>
    );
};
