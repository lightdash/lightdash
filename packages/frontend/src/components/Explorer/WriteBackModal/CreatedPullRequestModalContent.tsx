import { Anchor, Button, Stack, Text } from '@mantine/core';
import { IconGitBranch } from '@tabler/icons-react';
import { Trans, useTranslation } from 'react-i18next';
import MantineModal from '../../common/MantineModal';

export const CreatedPullRequestModalContent = ({
    onClose,
    data,
}: {
    onClose: () => void;
    data: { prUrl: string };
}) => {
    const { t } = useTranslation('explorer');
    return (
        <MantineModal
            size="auto"
            opened
            onClose={onClose}
            title={t('writeBack.title')}
            icon={IconGitBranch}
            actions={
                <Button onClick={onClose}>
                    {t('actions.close', { ns: 'common' })}
                </Button>
            }
            modalRootProps={{
                onClick: (e) => e.stopPropagation(),
            }}
        >
            <Stack gap="md">
                <Text>
                    <Trans
                        t={t}
                        i18nKey="writeBack.prCreated"
                        values={{ number: data.prUrl.split('/').pop() }}
                        components={{
                            anchor: (
                                <Anchor
                                    href={data.prUrl}
                                    target="_blank"
                                    fw={600}
                                />
                            ),
                        }}
                    />
                </Text>
                <Text>{t('writeBack.refreshAfterMerge')}</Text>
            </Stack>
        </MantineModal>
    );
};
