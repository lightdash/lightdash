import { Alert, Loader, Radio, Stack, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import {
    useFinishGoogleLiveSource,
    usePendingGoogleLiveSource,
} from '../hooks/usePendingGoogleLiveSource';

type Props = {
    projectUuid: string;
    onClose: () => void;
    onConnected: (connectionUuid: string) => void;
};

/** After a Google sign-in that can read several properties, the admin picks the one to connect. */
export const GoogleSourcePickerModal: FC<Props> = ({
    projectUuid,
    onClose,
    onConnected,
}) => {
    const { data, isLoading, error } = usePendingGoogleLiveSource(
        projectUuid,
        true,
    );
    const finishMutation = useFinishGoogleLiveSource(projectUuid);
    const [choice, setChoice] = useState<string | null>(null);

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={data ? `Pick what ${data.name} reads` : 'Finish connecting'}
            confirmLabel="Connect"
            confirmDisabled={!choice}
            confirmLoading={finishMutation.isLoading}
            cancelDisabled={finishMutation.isLoading}
            onConfirm={async () => {
                if (!choice) return;
                const connection = await finishMutation.mutateAsync(choice);
                onConnected(connection.externalConnectionUuid);
            }}
        >
            {isLoading ? (
                <Loader size="sm" />
            ) : error || !data ? (
                <Alert
                    color="red"
                    icon={<MantineIcon icon={IconAlertCircle} />}
                >
                    {error?.error.message ??
                        "We couldn't find your Google sign-in, add the source again"}
                </Alert>
            ) : (
                <Stack gap="sm">
                    <Text c="dimmed" fz="sm">
                        Your Google account can read more than one, so pick one
                        for this source
                    </Text>
                    <Radio.Group value={choice} onChange={setChoice}>
                        <Stack gap="xs">
                            {data.choices.map((option) => (
                                <Radio
                                    key={option.value}
                                    value={option.value}
                                    label={option.label}
                                    description={option.description}
                                />
                            ))}
                        </Stack>
                    </Radio.Group>
                </Stack>
            )}
        </MantineModal>
    );
};
