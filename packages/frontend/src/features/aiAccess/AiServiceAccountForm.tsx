import { BigqueryAuthenticationType, WarehouseTypes } from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import MantineModal from '../../components/common/MantineModal';
import { BigQueryKeyFileInput } from '../../components/ProjectConnection/WarehouseForms/BigQueryKeyFileInput';
import { useSaveAiServiceAccount, useTestAiServiceAccount } from './api';

export const AiServiceAccountForm = ({
    projectUuid,
    onClose,
}: {
    projectUuid: string;
    onClose: () => void;
}) => {
    const [file, setFile] = useState<File | null>(null);
    const [keyfileContents, setKeyfileContents] = useState<Record<
        string,
        string
    > | null>(null);
    const save = useSaveAiServiceAccount(projectUuid);
    const test = useTestAiServiceAccount(projectUuid);
    const credentials = keyfileContents
        ? {
              type: WarehouseTypes.BIGQUERY as const,
              authenticationType:
                  BigqueryAuthenticationType.PRIVATE_KEY as const,
              keyfileContents,
          }
        : null;
    const busy = save.isLoading || test.isLoading;
    return (
        <MantineModal
            opened
            title="AI service account"
            onClose={busy ? () => {} : onClose}
            confirmLabel="Save"
            confirmDisabled={!credentials || busy}
            confirmLoading={save.isLoading}
            onConfirm={() => {
                if (credentials)
                    save.mutate(credentials, { onSuccess: onClose });
            }}
            actions={
                <Button
                    variant="default"
                    disabled={!credentials || busy}
                    loading={test.isLoading}
                    onClick={() => {
                        if (credentials) test.mutate({ credentials });
                    }}
                >
                    Test
                </Button>
            }
        >
            <Stack gap="sm">
                <BigQueryKeyFileInput
                    value={file}
                    onChange={(next) => {
                        setFile(next);
                        test.reset();
                    }}
                    onKeyfileChange={setKeyfileContents}
                    disabled={busy}
                />
                {test.data && (
                    <Text size="sm" role="status">
                        {test.data.ok && test.data.principal
                            ? `Connected as ${test.data.principal}`
                            : test.data.message}
                    </Text>
                )}
                {test.error && (
                    <Text size="sm" c="red" role="alert">
                        {test.error.error.message}
                    </Text>
                )}
            </Stack>
        </MantineModal>
    );
};
