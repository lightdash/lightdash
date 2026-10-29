import { Alert, Loader, Radio, Stack, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import {
    useFinishGoogleLiveSource,
    usePendingGoogleLiveSource,
} from '../../../features/externalConnections/hooks/usePendingGoogleLiveSource';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';

type Props = {
    projectUuid: string;
    onClose: () => void;
};

/** After a Google sign-in that can read several properties, the admin picks the one to connect. */
export const GoogleSourcePickerModal: FC<Props> = ({
    projectUuid,
    onClose,
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
                await finishMutation.mutateAsync(choice);
                onClose();
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
                        'No Google sign-in is waiting. Add the source again.'}
                </Alert>
            ) : (
                <Stack gap="sm">
                    <Text c="dimmed" fz="sm">
                        The Google account you signed in with can read more than
                        one. Pick one for this source; add another source for
                        the rest.
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
