import { Checkbox, Stack, Text } from '@mantine/core';
import Callout from '../common/Callout';
import { SqlPanel } from './SqlPanel';
export const SessionCeilingStep = ({
    sql,
    confirmed,
    setConfirmed,
}: {
    sql: string;
    confirmed: boolean;
    setConfirmed: (value: boolean) => void;
}) => (
    <Stack gap="sm">
        {sql && <SqlPanel sql={sql} />}
        <Callout variant="warning">
            <Stack gap="xs">
                <Text fz="sm">
                    A view or a stored result can still show data from a schema
                    the scope blocks. Snowflake runs views with the owner's
                    rights, and RESULT_SCAN can read a person's earlier results.
                    Masking in step 3 is the main control; this scope is the
                    second layer.
                </Text>
                <Text fz="sm">
                    A session policy set on a user replaces the account-level
                    one. Check SHOW SESSION POLICIES and users with their own
                    policy.
                </Text>
            </Stack>
        </Callout>
        <Checkbox
            label="I ran this SQL"
            checked={confirmed}
            disabled={!sql}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
        />
    </Stack>
);
