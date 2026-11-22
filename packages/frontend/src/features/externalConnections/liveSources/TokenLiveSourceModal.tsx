/**
 * Adds a live data source that reads with an API token, laid out like its
 * settings: how it reaches the integration first, then what it is called.
 */
import { Button, PasswordInput, Stack, TextInput } from '@mantine/core';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useCreateExternalConnection } from '../hooks/useCreateExternalConnection';
import { useNewSourceId } from '../hooks/useNewSourceId';
import { useTestConnectionConfig } from '../hooks/useTestConnectionConfig';
import { LiveSourceTitle } from './LiveSourceIcon';
import {
    SettingsCard,
    SettingsRow,
    TestOutcome,
} from './LiveSourceSettingsRows';
import { LiveSourceSetupCard } from './LiveSourceSetupCard';
import { NewLiveSourceDetails } from './NewLiveSourceDetails';
import {
    normalizeAccountId,
    toTokenLiveSourceCreatePayload,
    useTokenLiveSourceForm,
    type TokenLiveSourceForm,
} from './tokenLiveSource';

/** Matches the fields of the Details card below. */
const FIELD_WIDTH = 240;

type Props = {
    form: TokenLiveSourceForm;
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    onCreated: (connectionUuid: string) => void;
};

export const TokenLiveSourceModal: FC<Props> = ({
    form: definition,
    opened,
    onClose,
    projectUuid,
    onCreated,
}) => {
    const { connector } = definition.toApiSource('');
    const form = useTokenLiveSourceForm(definition, null);
    const createMutation = useCreateExternalConnection();
    const testMutation = useTestConnectionConfig();
    const sourceId = useNewSourceId({
        projectUuid,
        connector,
        name: form.values.name,
        enabled: opened,
    });
    const isSaving = createMutation.isLoading;
    const { account } = definition;

    const handleTest = () => {
        if (form.validate().hasErrors) return;
        testMutation.mutate({
            projectUuid,
            config: toTokenLiveSourceCreatePayload(definition, form.values),
            ...definition.getTestRequest(
                normalizeAccountId(definition, form.values.accountId),
            ),
        });
    };

    const handleSave = form.onSubmit(async (values) => {
        if (sourceId.isBlocked) return;
        const created = await createMutation.mutateAsync({
            projectUuid,
            data: {
                ...toTokenLiveSourceCreatePayload(definition, values),
                explorePrefix: sourceId.value,
            },
        });
        onCreated(created.externalConnectionUuid);
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            size="xl"
            title={
                <LiveSourceTitle connector={connector}>
                    Add {definition.label} source
                </LiveSourceTitle>
            }
            confirmLabel="Add source"
            onConfirm={() => handleSave()}
            confirmLoading={isSaving}
            confirmDisabled={sourceId.isBlocked}
            cancelDisabled={isSaving}
        >
            <Stack gap="lg">
                <LiveSourceSetupCard connector={connector} />
                <SettingsCard title="Access">
                    {account ? (
                        <SettingsRow
                            label={account.label}
                            hint={account.description}
                        >
                            <TextInput
                                w={FIELD_WIDTH}
                                size="xs"
                                aria-label={account.label}
                                placeholder={account.placeholder}
                                data-autofocus
                                {...form.getInputProps('accountId')}
                            />
                        </SettingsRow>
                    ) : null}
                    <SettingsRow
                        label={definition.tokenLabel}
                        hint={
                            testMutation.data ? (
                                <TestOutcome response={testMutation.data} />
                            ) : (
                                'Read access is enough'
                            )
                        }
                    >
                        <PasswordInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label={definition.tokenLabel}
                            data-autofocus={account ? undefined : true}
                            {...form.getInputProps('token')}
                        />
                        <Button
                            size="xs"
                            variant="default"
                            onClick={handleTest}
                            loading={testMutation.isLoading}
                        >
                            Test
                        </Button>
                    </SettingsRow>
                </SettingsCard>

                <NewLiveSourceDetails
                    nameProps={form.getInputProps('name')}
                    sourceId={sourceId}
                />
            </Stack>
        </MantineModal>
    );
};
