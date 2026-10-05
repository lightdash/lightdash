import { getAiTwinSessionCeilingSql, type AiIdentity } from '@lightdash/common';
import {
    Accordion,
    Button,
    Checkbox,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import {
    useAiIdentitiesSql,
    useProvisionAiIdentities,
} from '../../hooks/useAiIdentities';
import { SqlPanel } from './SqlPanel';

const automation = `curl "$LIGHTDASH_URL/api/v2/projects/$PROJECT_UUID/ai-identities" \\
  -H "Authorization: ApiKey $LIGHTDASH_API_KEY"

curl -X POST "$LIGHTDASH_URL/api/v2/projects/$PROJECT_UUID/ai-identities/provision" \\
  -H "Authorization: ApiKey $LIGHTDASH_API_KEY"

curl -X PATCH "$LIGHTDASH_URL/api/v2/projects/$PROJECT_UUID/ai-identities/$USER_UUID" \\
  -H "Authorization: ApiKey $LIGHTDASH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"twinNameOverride":"PERSON_AI"}'

curl -X POST "$LIGHTDASH_URL/api/v2/projects/$PROJECT_UUID/ai-identities/$USER_UUID/test" \\
  -H "Authorization: ApiKey $LIGHTDASH_API_KEY"`;

export const AiTwinCreateStep = ({
    projectUuid,
    identities,
    database,
    schema,
    confirmedSql,
    onConfirm,
}: {
    projectUuid: string;
    identities: AiIdentity[];
    database: string;
    schema: string;
    confirmedSql: string;
    onConfirm: (sql: string) => void;
}) => {
    const [role, setRole] = useLocalStorage({
        key: `snowflake-ai-twins:${projectUuid}:role`,
        defaultValue: '',
    });
    const provision = useProvisionAiIdentities(projectUuid);
    const sql = useAiIdentitiesSql(projectUuid, role, identities.length > 0);
    let sessionSql = '';
    try {
        sessionSql = getAiTwinSessionCeilingSql({
            database,
            schema,
            blockedRoles: [],
            twinNames: identities.flatMap((identity) =>
                identity.twinName === null ? [] : [identity.twinName],
            ),
        });
    } catch {
        sessionSql = '';
    }
    const bulkSql =
        sql.isError || sql.isFetching || identities.length === 0
            ? ''
            : (sql.data?.sql ?? '');
    const allSql = [bulkSql, sessionSql].filter(Boolean).join('\n\n');
    const canConfirm = Boolean(bulkSql && sessionSql && !sql.isFetching);
    const download = () => {
        const url = URL.createObjectURL(
            new Blob([allSql], { type: 'application/sql' }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = 'snowflake-ai-users.sql';
        link.click();
        URL.revokeObjectURL(url);
    };
    return (
        <Stack gap="sm">
            <Button
                size="xs"
                loading={provision.isLoading}
                onClick={() => provision.mutate()}
            >
                Create keys
            </Button>
            {provision.error && (
                <Text c="red">{provision.error.error.message}</Text>
            )}
            <TextInput
                label="Role without PII"
                description="Use a role that grants the intended access without PII. Adjust each user's role in the SQL when needed."
                value={role}
                onChange={(event) => setRole(event.currentTarget.value)}
            />
            {sql.error && <Text c="red">{sql.error.error.message}</Text>}
            {sql.isFetching && <Text fz="sm">Loading SQL…</Text>}
            {bulkSql && <SqlPanel sql={allSql} />}
            <Button
                size="xs"
                variant="default"
                disabled={!canConfirm}
                onClick={download}
            >
                Download .sql
            </Button>
            {!sessionSql && (
                <Text fz="sm">
                    Set the tag database and schema in step 3 to generate the
                    session policy.
                </Text>
            )}
            <Text fz="sm">
                The SQL attaches the session policy to each named AI user. A
                user policy replaces the account policy. Check existing policies
                before you run it.
            </Text>
            <Checkbox
                label="I ran this SQL"
                disabled={!canConfirm}
                checked={canConfirm && confirmedSql === allSql}
                onChange={(event) =>
                    onConfirm(event.currentTarget.checked ? allSql : '')
                }
            />
            <Accordion>
                <Accordion.Item value="automation">
                    <Accordion.Control>Automate it</Accordion.Control>
                    <Accordion.Panel>
                        <Stack gap="sm">
                            <Text fz="sm">
                                Your automation reads public keys from the list
                                and sets RSA_PUBLIC_KEY in Snowflake. Use each
                                person's twinName and publicKey to create their
                                SERVICE_AGENT user. Set their role, attach the
                                session policy, then test their AI user.
                            </Text>
                            <SqlPanel
                                sql={automation}
                                copyLabel="Copy commands"
                            />
                        </Stack>
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>
        </Stack>
    );
};
