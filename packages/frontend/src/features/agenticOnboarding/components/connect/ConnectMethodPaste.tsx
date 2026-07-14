import { Anchor, Button, Stack, Table, Text, Textarea } from '@mantine-8/core';
import { useMemo, useState, type FC } from 'react';
import Callout from '../../../../components/common/Callout';
import { useFormContext } from '../../../../components/ProjectConnection/formContext';
import { useOnboardingWizard } from '../../context/wizardContext';
import { ConnectMethodId } from '../../utils/methodRegistry';
import {
    maskSecretValue,
    parseConnectionPaste,
    type ParsedConnectionField,
} from '../../utils/parseConnectionPaste';
import MethodScreenLayout from './MethodScreenLayout';

const FORMAT_LABELS: Record<string, string> = {
    connection_string: 'Connection string',
    profiles_yml: 'dbt profiles.yml',
    key_values: 'Key-value pairs',
};

const ConnectMethodPaste: FC = () => {
    const form = useFormContext();
    const wizard = useOnboardingWizard();
    const [pasted, setPasted] = useState('');

    const parsed = useMemo(() => parseConnectionPaste(pasted), [pasted]);

    const applyAndContinue = () => {
        if (!parsed) return;
        (
            Object.entries(parsed.values) as [ParsedConnectionField, string][]
        ).forEach(([field, value]) => {
            form.setFieldValue(`warehouse.${field}`, value);
        });
        form.setTouched({ 'warehouse.account': true });
        wizard.selectMethod(ConnectMethodId.MANUAL);
    };

    return (
        <MethodScreenLayout title="Paste connection details">
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    Paste a connection string, a dbt <code>profiles.yml</code>,
                    or key-value pairs. We detect the format and pre-fill the
                    form — nothing leaves your browser until you submit.
                </Text>

                <Textarea
                    label="Connection details"
                    autosize
                    minRows={6}
                    value={pasted}
                    onChange={(e) => setPasted(e.currentTarget.value)}
                />

                {pasted.trim() !== '' && !parsed && (
                    <Callout variant="warning">
                        We couldn't detect a connection format. Try a different
                        snippet or fill the form manually.
                    </Callout>
                )}

                {parsed && (
                    <Stack gap="xs">
                        <Text size="sm" fw={500}>
                            Detected: {FORMAT_LABELS[parsed.format]}
                        </Text>
                        <Table withRowBorders={false}>
                            <Table.Tbody>
                                {(
                                    Object.entries(parsed.values) as [
                                        ParsedConnectionField,
                                        string,
                                    ][]
                                ).map(([field, value]) => (
                                    <Table.Tr key={field}>
                                        <Table.Td>
                                            <Text size="sm" c="dimmed">
                                                {field}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm">
                                                {parsed.secretFields.includes(
                                                    field,
                                                )
                                                    ? maskSecretValue(value)
                                                    : value}
                                            </Text>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                        <Button
                            onClick={applyAndContinue}
                            style={{ alignSelf: 'flex-end' }}
                        >
                            Use these details
                        </Button>
                    </Stack>
                )}

                <Anchor
                    size="sm"
                    onClick={() => wizard.selectMethod(ConnectMethodId.MANUAL)}
                >
                    Fill manually instead
                </Anchor>
            </Stack>
        </MethodScreenLayout>
    );
};

export default ConnectMethodPaste;
