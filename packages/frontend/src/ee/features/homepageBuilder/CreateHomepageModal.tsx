import { type ProjectHomepage } from '@lightdash/common';
import { Card, Radio, Stack, Text, TextInput } from '@mantine/core';
import { IconSquareRoundedPlus } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineModal from '../../../components/common/MantineModal';
import { useCreateHomepage } from './hooks/useProjectHomepage';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    homepages: ProjectHomepage[];
    onCreated: (homepage: ProjectHomepage) => void;
};

export const CreateHomepageModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    homepages,
    onCreated,
}) => {
    const { t } = useTranslation('homepageBuilder');
    const createMutation = useCreateHomepage(projectUuid);
    const [name, setName] = useState('');
    const [startFrom, setStartFrom] = useState('blank');

    // Reset on close (not via an opened-effect) so the next open starts fresh
    // without a flash of the previous attempt's values.
    const resetForm = () => {
        setName('');
        setStartFrom('blank');
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleCreate = () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        createMutation.mutate(
            {
                name: trimmed,
                duplicateFrom: startFrom === 'blank' ? undefined : startFrom,
            },
            {
                onSuccess: (homepage) => {
                    resetForm();
                    onCreated(homepage);
                },
            },
        );
    };

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title={t('create.title')}
            icon={IconSquareRoundedPlus}
            onConfirm={handleCreate}
            confirmLabel={t('create.confirm')}
            confirmDisabled={name.trim().length === 0}
            confirmLoading={createMutation.isLoading}
        >
            <Stack gap="sm">
                <Text c="dimmed" size="sm">
                    {t('create.description')}
                </Text>
                <TextInput
                    label={t('create.name')}
                    placeholder={t('create.namePlaceholder')}
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                    data-autofocus
                />
                <Radio.Group
                    label={t('create.startFrom')}
                    value={startFrom}
                    onChange={setStartFrom}
                >
                    <Stack gap="xs" mt="xs">
                        <Card p="sm">
                            <Radio value="blank" label={t('create.blank')} />
                        </Card>
                        {homepages.map((homepage) => (
                            <Card key={homepage.homepageUuid} p="sm">
                                <Radio
                                    value={homepage.homepageUuid}
                                    label={t('create.duplicate', {
                                        name: homepage.name,
                                    })}
                                />
                            </Card>
                        ))}
                    </Stack>
                </Radio.Group>
            </Stack>
        </MantineModal>
    );
};
