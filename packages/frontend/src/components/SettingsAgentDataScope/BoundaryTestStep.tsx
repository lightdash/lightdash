import {
    type SnowflakeAiBoundaryCheck,
    type SnowflakeAiBoundaryTestBody,
} from '@lightdash/common';
import { Button, Stack, Text, TextInput } from '@mantine/core';
import { TestResults } from './TestResults';
type ProtectedColumnInputs = NonNullable<
    SnowflakeAiBoundaryTestBody['protectedColumn']
>;

export const BoundaryTestStep = ({
    protectedColumn,
    setProtectedColumn,
    loading,
    onTest,
    checks,
    error,
    onFix,
    aiTwins = false,
}: {
    protectedColumn: ProtectedColumnInputs;
    setProtectedColumn: (value: ProtectedColumnInputs) => void;
    loading: boolean;
    onTest: (body: SnowflakeAiBoundaryTestBody) => void;
    checks: SnowflakeAiBoundaryCheck[] | null;
    error: string;
    onFix: (step: number) => void;
    aiTwins?: boolean;
}) => (
    <Stack gap="sm">
        <Text fz="sm">
            Optional: enter a protected column to verify masking.
        </Text>
        {(['database', 'schema', 'table', 'column'] as const).map((field) => (
            <TextInput
                key={field}
                label={field}
                value={protectedColumn[field]}
                onChange={(event) =>
                    setProtectedColumn({
                        ...protectedColumn,
                        [field]: event.currentTarget.value,
                    })
                }
            />
        ))}
        {aiTwins ? (
            <Text fz="sm">
                This test runs as your own AI user. AI users cannot read results
                of queries that other users ran.
            </Text>
        ) : (
            <Text fz="sm">
                A live test showed that an agent session can read the same
                person's earlier results with RESULT_SCAN, even when the session
                scope blocks the schema. So with AI access restrictions on, raw
                SQL from AI agents and MCP stays off; AI answers through the
                semantic layer on each person's sign-in for AI.
            </Text>
        )}
        <Button
            size="xs"
            loading={loading}
            onClick={() =>
                onTest({
                    protectedColumn: Object.values(protectedColumn).every(
                        Boolean,
                    )
                        ? protectedColumn
                        : null,
                })
            }
        >
            Test boundary
        </Button>
        <TestResults checks={checks} error={error} onFix={onFix} />
    </Stack>
);
