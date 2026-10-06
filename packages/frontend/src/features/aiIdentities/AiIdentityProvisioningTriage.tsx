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
            <AiIdentityUngrantedSchemas entries={settings.ungrantedSchemas} />
            {isProvisioningFallback(settings) && (
                <Callout variant="warning">
                    {settings.fallbackReason ??
                        'Automatic creation is unavailable. Your team can create AI identities with the guided setup.'}{' '}
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
