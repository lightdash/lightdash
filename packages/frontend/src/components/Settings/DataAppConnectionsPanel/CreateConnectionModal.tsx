import { type CreateExternalConnection } from '@lightdash/common';
import { Button } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { useCreateExternalConnection } from '../../../features/externalConnections/hooks/useCreateExternalConnection';
import MantineModal, {
    type MantineModalProps,
} from '../../common/MantineModal';
import {
    ExternalConnectionForm,
    type ExternalConnectionFormValues,
} from './ExternalConnectionForm';

const FORM_ID = 'create-external-connection-form';

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
};

const toCreatePayload = (
    values: ExternalConnectionFormValues,
): CreateExternalConnection => ({
    name: values.name,
    origin: values.origin,
    type: values.type,
    // Blank secret on a "none" connection (or an unfilled field) => null.
    secret: values.type !== 'none' && values.secret ? values.secret : null,
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
    apiKeyLocation: values.type === 'api_key' ? values.apiKeyLocation : null,
});

export const CreateConnectionModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
}) => {
    const { mutateAsync, isLoading: isSaving } = useCreateExternalConnection();
    const form = useForm<ExternalConnectionFormValues>({
        initialValues: {
            name: '',
            origin: 'https://',
            type: 'none',
            secret: '',
            apiKeyName: '',
            apiKeyLocation: 'header',
            allowedMethods: ['GET'],
            allowedPathPrefixes: [],
            allowedContentTypes: ['application/json'],
            responseMaxBytes: 1_000_000,
            requestMaxBytes: 1_000_000,
            timeoutMs: 10_000,
            rateLimitPerMinute: null,
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
        await mutateAsync({
            projectUuid,
            data: toCreatePayload(values),
        });
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Add data app connection"
            icon={IconPlus}
            size="lg"
            cancelDisabled={isSaving}
            actions={
                <Button
                    type="submit"
                    form={FORM_ID}
                    disabled={isSaving}
                    loading={isSaving}
                >
                    Create connection
                </Button>
            }
        >
            <form id={FORM_ID} onSubmit={form.onSubmit(handleSubmit)}>
                <ExternalConnectionForm
                    form={form}
                    disabled={isSaving}
                    hasSecret={false}
                />
            </form>
        </MantineModal>
    );
};
