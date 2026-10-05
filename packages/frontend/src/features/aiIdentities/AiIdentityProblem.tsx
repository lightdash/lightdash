import {
    getAiIdentityFailureGroupCopy,
    type AiIdentity,
    type AiIdentityFailureReason,
} from '@lightdash/common';
import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import classes from './AiIdentitiesPage.module.css';

export const AiIdentityProblem: FC<{
    identity: AiIdentity;
    fixSql: string | null;
    sameReasonCount: number;
    onShowGroup: (reason: AiIdentityFailureReason) => void;
}> = ({ identity, fixSql, sameReasonCount, onShowGroup }) => {
    const cause = identity.failureReason
        ? getAiIdentityFailureGroupCopy(identity.failureReason)
        : null;
    return (
        <>
            {(cause || identity.statusMessage) && (
                <Stack gap="xs">
                    <Title order={5}>What is wrong</Title>
                    {cause && <Text fz="sm">{cause.explanation}</Text>}
                    {identity.statusMessage && (
                        <>
                            <Text fz="xs" c="dimmed">
                                Snowflake said
                            </Text>
                            <div className={classes.fixSql}>
                                <CodeBlock
                                    code={identity.statusMessage}
                                    language="text"
                                />
                            </div>
                        </>
                    )}
                </Stack>
            )}
            {fixSql && (
                <Stack gap="xs">
                    <Title order={5}>How to fix</Title>
                    {cause && <Text fz="sm">{cause.fix}</Text>}
                    <div className={classes.fixSql}>
                        <CodeBlock code={fixSql} language="sql" />
                    </div>
                </Stack>
            )}
            {!!sameReasonCount && identity.failureReason && (
                <Group>
                    <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => onShowGroup(identity.failureReason!)}
                    >
                        {sameReasonCount} others have this problem
                    </Button>
                </Group>
            )}
        </>
    );
};
