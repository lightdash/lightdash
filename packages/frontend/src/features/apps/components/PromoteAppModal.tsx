import { Group, Loader, Stack, Text } from '@mantine-8/core';
import { IconFolder, IconRocket } from '@tabler/icons-react';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { usePromoteApp, usePromoteAppDiff } from '../hooks/usePromoteApp';

type Props = {
    projectUuid: string;
    appUuid: string;
    opened: boolean;
    onClose: () => void;
};

export const PromoteAppModal: FC<Props> = ({
    projectUuid,
    appUuid,
    opened,
    onClose,
}) => {
    const navigate = useNavigate();
    const { data: diff, isInitialLoading: isDiffLoading } = usePromoteAppDiff(
        { projectUuid, appUuid },
        { enabled: opened },
    );
    const { mutate: promote, isLoading: isPromoting } = usePromoteApp();

    const handleConfirm = () => {
        promote(
            { projectUuid, appUuid },
            {
                onSuccess: (result) => {
                    onClose();
                    void navigate(
                        `/projects/${result.projectUuid}/apps/${result.appUuid}`,
                    );
                },
            },
        );
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Promote data app"
            icon={IconRocket}
            size="md"
            confirmLabel="Promote"
            confirmLoading={isPromoting}
            confirmDisabled={isDiffLoading || !diff}
            onConfirm={handleConfirm}
        >
            {isDiffLoading || !diff ? (
                <Group justify="center" py="md">
                    <Loader size="sm" />
                </Group>
            ) : (
                <Stack gap="sm">
                    <Text size="sm">
                        {diff.action === 'update' ? (
                            <>
                                This will add a new version to the existing app
                                in{' '}
                                <Text span fw={600}>
                                    {diff.upstreamProjectName}
                                </Text>
                                .
                            </>
                        ) : (
                            <>
                                This will create a new app in{' '}
                                <Text span fw={600}>
                                    {diff.upstreamProjectName}
                                </Text>{' '}
                                from the latest version.
                            </>
                        )}
                    </Text>
                    <Group gap="xs">
                        <MantineIcon icon={IconFolder} color="ldGray.6" />
                        <Text size="sm" c="dimmed">
                            {diff.space
                                ? `Space: ${diff.space.name}`
                                : 'Personal app (no space)'}
                        </Text>
                    </Group>
                </Stack>
            )}
        </MantineModal>
    );
};
