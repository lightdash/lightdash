import {
    ConnectionInputParseKind,
    FeatureFlags,
    getWarehouseConnectionInputIssues,
    LightdashMode,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type WarehouseConnectionInputIssue,
} from '@lightdash/common';
import { Box, Button, List, Stack, Text } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import Callout from '../common/Callout';
import MantineIcon from '../common/MantineIcon';
import { useFormContext } from './formContext';

type ConfirmationIssue = WarehouseConnectionInputIssue & {
    result: { kind: ConnectionInputParseKind.NEEDS_CONFIRMATION };
};

const isConfirmation = (
    issue: WarehouseConnectionInputIssue,
): issue is ConfirmationIssue =>
    issue.result.kind === ConnectionInputParseKind.NEEDS_CONFIRMATION;

const ConfirmationCallout: FC<{
    issue: ConfirmationIssue;
    onUse: (issue: ConfirmationIssue) => void;
}> = ({ issue, onUse }) => (
    <Callout variant="warning" title={`Did you mean ${issue.result.proposed}?`}>
        <Stack gap="xs">
            <List size="sm">
                {issue.result.changes.map((change) => (
                    <List.Item key={change}>{change}</List.Item>
                ))}
            </List>
            <Text size="sm">
                This can change where Lightdash connects or whether it uses TLS,
                so check it before you test.
            </Text>
            <Box>
                <Button size="xs" onClick={() => onUse(issue)}>
                    Use {issue.result.proposed}
                </Button>
            </Box>
        </Stack>
    </Callout>
);

export const WarehouseConnectionInputReview: FC<{ children: ReactNode }> = ({
    children,
}) => {
    const form = useFormContext();
    const { health } = useApp();
    const connectJourneyFlag = useServerFeatureFlag(
        FeatureFlags.ConnectJourney,
    );
    const [appliedChanges, setAppliedChanges] = useState<string[]>([]);

    const issues = connectJourneyFlag.data?.enabled
        ? getWarehouseConnectionInputIssues(
              form.values.warehouse as CreateWarehouseCredentials,
              {
                  allowLocalHosts:
                      health.data?.mode !== LightdashMode.CLOUD_BETA,
              },
          )
        : [];

    const applyAutomaticFixes = () => {
        const changes = issues.flatMap(({ field, result }) => {
            if (result.kind !== ConnectionInputParseKind.NORMALISED) return [];
            form.setFieldValue(`warehouse.${field}`, result.value);
            return result.changes;
        });
        if (changes.length > 0) setAppliedChanges(changes);
    };

    const applyProposal = ({ field, result }: ConfirmationIssue) => {
        form.setFieldValue(`warehouse.${field}`, result.proposed);
        if (result.proposedPort !== null) {
            form.setFieldValue('warehouse.port', result.proposedPort);
        }
        const isSecureScheme = result.scheme === 'https';
        if (
            result.scheme &&
            form.values.warehouse.type === WarehouseTypes.CLICKHOUSE
        ) {
            form.setFieldValue('warehouse.secure', isSecureScheme);
        }
        if (
            result.scheme &&
            form.values.warehouse.type === WarehouseTypes.TRINO
        ) {
            form.setFieldValue(
                'warehouse.http_scheme',
                isSecureScheme ? 'https' : 'http',
            );
        }
        setAppliedChanges([
            `We set the ${field} to ${result.proposed}`,
            ...(result.proposedPort !== null
                ? [`We set the port to ${result.proposedPort}`]
                : []),
        ]);
    };

    const confirmations = issues.filter(isConfirmation);
    const blocked = issues.flatMap(({ result }) =>
        result.kind === ConnectionInputParseKind.BLOCKED ? [result.reason] : [],
    );

    return (
        <Box onBlurCapture={applyAutomaticFixes}>
            {children}
            <Stack
                gap="sm"
                mt={issues.length + appliedChanges.length > 0 ? 'md' : 0}
            >
                {appliedChanges.length > 0 && (
                    <Callout
                        variant="neutral"
                        icon={<MantineIcon icon={IconCheck} size="lg" />}
                        title="We tidied what you typed"
                    >
                        <List size="sm">
                            {appliedChanges.map((change) => (
                                <List.Item key={change}>{change}</List.Item>
                            ))}
                        </List>
                    </Callout>
                )}
                {confirmations.map((issue) => (
                    <ConfirmationCallout
                        key={issue.field}
                        issue={issue}
                        onUse={applyProposal}
                    />
                ))}
                {blocked.map((reason) => (
                    <Callout key={reason} variant="danger">
                        {reason}
                    </Callout>
                ))}
            </Stack>
        </Box>
    );
};
