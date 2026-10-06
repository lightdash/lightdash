import {
    Anchor,
    Badge,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useState, type FC } from 'react';
import Callout from '../../components/common/Callout';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import MantineModal from '../../components/common/MantineModal';
import { AiIdentityUngrantedSchemas } from './AiIdentityUngrantedSchemas';
import { beyondOwnAccessMessages } from './beyondOwnAccessWarnings';
import { findingLabels, isProvisioningFallback } from './provisioning';
import { useProvisioning } from './useProvisioning';

export const AiIdentityProvisioningTriage: FC<{
    accountUuid: string;
    onSetup: () => void;
}> = ({ accountUuid, onSetup }) => {
    const query = useProvisioning(accountUuid);
    const [showFix, setShowFix] = useState(false);
    const settings = query.data;
    if (query.isError)
        return (
            <Callout variant="danger">
                Could not load provisioning status.
            </Callout>
        );
    if (!settings) return null;
    return (
        <>
            <AiIdentityUngrantedSchemas
                entries={settings.ungrantedSchemas}
                issues={settings.automaticSync.issues}
            />
            {settings.beyondOwnAccessWarnings.length > 0 && (
                <Callout
                    variant="warning"
                    title="AI roles exceed personal access"
                >
                    {beyondOwnAccessMessages(
                        settings.beyondOwnAccessWarnings,
                    ).map((message) => (
                        <Text key={message} fz="sm">
                            {message}
                        </Text>
                    ))}
                </Callout>
            )}
            {settings.automaticSync.issues.length > 0 && (
                <Callout variant="warning" title="Grant sync warnings">
                    {[
                        ...new Map(
                            settings.automaticSync.issues.map((issue) => [
                                JSON.stringify(issue),
                                issue,
                            ]),
                        ).entries(),
                    ].map(([key, issue]) => (
                        <Text key={key} fz="sm">
                            {issue.code}: {issue.message}
                            {issue.roleName ? ` (${issue.roleName})` : ''}
                            {issue.schema ? ` ${issue.schema}` : ''}
                        </Text>
                    ))}
                </Callout>
            )}
            {isProvisioningFallback(settings) && (
                <Callout variant="warning">
                    {settings.fallbackReason ??
                        'Automatic creation is paused. Check the setup to resume it.'}{' '}
                    <Anchor component="button" onClick={onSetup}>
                        Open Setup
                    </Anchor>
                </Callout>
            )}
            {settings.findings.length > 0 && (
                <Paper p="md">
                    <Stack gap="sm">
                        <Group>
                            <Title order={5}>
                                Users owned by the provisioner that need
                                attention
                            </Title>
                            <Badge color="red">
                                {settings.findings.length}
                            </Badge>
                        </Group>
                        {settings.findings.map((finding) => (
                            <Text
                                key={`${finding.userName}-${finding.reason}`}
                                fz="sm"
                            >
                                {finding.userName}:{' '}
                                {findingLabels[finding.reason]}
                            </Text>
                        ))}
                        <Group>
                            <Button
                                variant="default"
                                onClick={() => setShowFix(true)}
                            >
                                Show fix SQL
                            </Button>
                        </Group>
                        <MantineModal
                            opened={showFix}
                            onClose={() => setShowFix(false)}
                            title="Users that need attention"
                        >
                            {settings.findings.map((finding) => (
                                <Stack
                                    key={`${finding.userName}-${finding.reason}`}
                                    gap="xs"
                                >
                                    <Text fw={500}>{finding.userName}</Text>
                                    <Text fz="sm">
                                        {findingLabels[finding.reason]}
                                    </Text>
                                    <CodeBlock
                                        code={finding.fixSql}
                                        language="sql"
                                    />
                                </Stack>
                            ))}
                        </MantineModal>
                    </Stack>
                </Paper>
            )}
        </>
    );
};
