import { Group, Loader, Stack, Text } from '@mantine/core';
import { IconFolder, IconRocket } from '@tabler/icons-react';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('apps');
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
            title={t('promote.title')}
            icon={IconRocket}
            size="md"
            confirmLabel={t('actionsMenu.promote')}
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
                        <Trans
                            t={t}
                            i18nKey={
                                diff.action === 'update'
                                    ? 'promote.update'
                                    : 'promote.create'
                            }
                            values={{ project: diff.upstreamProjectName }}
                            components={{ b: <Text span fw={600} /> }}
                        />
                    </Text>
                    <Group gap="xs">
                        <MantineIcon icon={IconFolder} color="dimmed" />
                        <Text size="sm" c="dimmed">
                            {diff.space
                                ? t('promote.space', { name: diff.space.name })
                                : t('promote.personal')}
                        </Text>
                    </Group>
                </Stack>
            )}
        </MantineModal>
    );
};
