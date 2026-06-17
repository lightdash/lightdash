import {
    type ExternalConnection,
    type UpdateExternalConnection,
} from '@lightdash/common';
import { Button } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import { useUpdateExternalConnection } from '../../../features/externalConnections/hooks/useUpdateExternalConnection';
import MantineModal, {
    type MantineModalProps,
} from '../../common/MantineModal';
import {
    ExternalConnectionForm,
    type ExternalConnectionFormValues,
} from './ExternalConnectionForm';

const FORM_ID = 'edit-external-connection-form';

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    connection: ExternalConnection;
};

const EditConnectionModalContent: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    connection,
}) => {
    const { mutateAsync, isLoading: isSaving } = useUpdateExternalConnection();
    const form = useForm<ExternalConnectionFormValues>({
        initialValues: {
            name: connection.name,
            origin: connection.origin,
            type: connection.type,
            secret: '',
            apiKeyName: connection.apiKeyName ?? '',
            apiKeyLocation: connection.apiKeyLocation ?? 'header',
            allowedMethods: connection.allowedMethods,
            allowedPathPrefixes: connection.allowedPathPrefixes,
            allowedContentTypes: connection.allowedContentTypes,
            responseMaxBytes: connection.responseMaxBytes,
            requestMaxBytes: connection.requestMaxBytes,
            timeoutMs: connection.timeoutMs,
            rateLimitPerMinute: connection.rateLimitPerMinute,
        },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Name is required' : null,
            origin: (value) =>
                value.startsWith('https://')
                    ? null
                    : 'Origin must start with https://',
        },
    });

    const handleSubmit = async (values: ExternalConnectionFormValues) => {
        const data: UpdateExternalConnection = {
            name: values.name,
            origin: values.origin,
            type: values.type,
            allowedMethods: values.allowedMethods,
            allowedPathPrefixes: values.allowedPathPrefixes.filter(
                (p) => p.trim().length > 0,
            ),
            allowedContentTypes: values.allowedContentTypes,
            responseMaxBytes: values.responseMaxBytes,
            requestMaxBytes: values.requestMaxBytes,
            timeoutMs: values.timeoutMs,
            rateLimitPerMinute: values.rateLimitPerMinute,
            apiKeyName: values.type === 'api_key' ? values.apiKeyName : null,
            apiKeyLocation:
                values.type === 'api_key' ? values.apiKeyLocation : null,
            // Blank => omit so the stored secret is unchanged. A non-blank
            // value on a non-"none" type rotates it via PATCH.
            ...(values.type !== 'none' && values.secret
                ? { secret: values.secret }
                : {}),
        };
        await mutateAsync({
            projectUuid,
            connectionUuid: connection.externalConnectionUuid,
            data,
        });
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Edit data app connection"
            icon={IconPencil}
            size="lg"
            cancelDisabled={isSaving}
            actions={
                <Button
                    type="submit"
                    form={FORM_ID}
                    disabled={isSaving}
                    loading={isSaving}
                >
                    Save
                </Button>
            }
        >
            <form id={FORM_ID} onSubmit={form.onSubmit(handleSubmit)}>
                <ExternalConnectionForm
                    form={form}
                    disabled={isSaving}
                    hasSecret={connection.hasSecret}
                />
            </form>
        </MantineModal>
    );
};

export const EditConnectionModal: FC<Props> = (props) => (
    // Remount when the user switches connections so useForm re-initialises;
    // refetches of the same connection don't clobber in-progress edits.
    <EditConnectionModalContent
        key={props.connection.externalConnectionUuid}
        {...props}
    />
);
