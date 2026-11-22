import { Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useNewSourceId } from '../hooks/useNewSourceId';
import {
    getGoogleSignInUrl,
    getGoogleSource,
    type GoogleConnector,
} from './googleConnection';
import { LiveSourceTitle } from './LiveSourceIcon';
import { NewLiveSourceDetails } from './NewLiveSourceDetails';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    connector: GoogleConnector;
};

/** Adds a Google source, which signs in to Google to finish. */
export const GoogleConnectionModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    connector,
}) => {
    const source = getGoogleSource(connector);
    const form = useForm({
        initialValues: { name: source.defaultName },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Give it a name' : null,
        },
    });
    const sourceId = useNewSourceId({
        projectUuid,
        connector,
        name: form.values.name,
        enabled: opened,
    });

    const handleSave = form.onSubmit(({ name }) => {
        if (sourceId.isBlocked) return;
        window.location.assign(
            getGoogleSignInUrl(
                projectUuid,
                connector,
                name,
                null,
                'settings',
                sourceId.value,
            ),
        );
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            size="xl"
            title={
                <LiveSourceTitle connector={connector}>
                    Add {source.label} source
                </LiveSourceTitle>
            }
            confirmLabel="Continue to Google"
            onConfirm={() => handleSave()}
            confirmDisabled={sourceId.isBlocked}
        >
            <Stack gap="lg">
                <NewLiveSourceDetails
                    nameProps={form.getInputProps('name')}
                    sourceId={sourceId}
                />
            </Stack>
        </MantineModal>
    );
};
