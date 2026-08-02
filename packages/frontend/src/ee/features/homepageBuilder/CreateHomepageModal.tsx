import { type ProjectHomepage } from '@lightdash/common';
import { Card, Radio, Stack, Text, TextInput } from '@mantine-8/core';
import { IconSquareRoundedPlus } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
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
    const createMutation = useCreateHomepage(projectUuid);
    const [name, setName] = useState('');
    const [startFrom, setStartFrom] = useState('blank');

    // Reset the form each time the modal opens fresh, rather than carrying
    // over the previous attempt's values.
    useEffect(() => {
        if (opened) {
            setName('');
            setStartFrom('blank');
        }
    }, [opened]);

    const handleCreate = () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        createMutation.mutate(
            {
                name: trimmed,
                duplicateFrom: startFrom === 'blank' ? undefined : startFrom,
            },
            { onSuccess: onCreated },
        );
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Create a homepage"
            icon={IconSquareRoundedPlus}
            onConfirm={handleCreate}
            confirmLabel="Create homepage"
            confirmDisabled={name.trim().length === 0}
            confirmLoading={createMutation.isLoading}
        >
            <Stack gap="sm">
                <Text c="dimmed" size="sm">
                    Curate a landing page for this project. Publishing makes it
                    what everyone sees when they land in Lightdash.
                </Text>
                <TextInput
                    label="Name"
                    placeholder="e.g. Team homepage"
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                    data-autofocus
                />
                <Radio.Group
                    label="Start from"
                    value={startFrom}
                    onChange={setStartFrom}
                >
                    <Stack gap="xs" mt="xs">
                        <Card withBorder p="sm">
                            <Radio value="blank" label="Blank" />
                        </Card>
                        {homepages.map((homepage) => (
                            <Card key={homepage.homepageUuid} withBorder p="sm">
                                <Radio
                                    value={homepage.homepageUuid}
                                    label={`Duplicate “${homepage.name}”`}
                                />
                            </Card>
                        ))}
                    </Stack>
                </Radio.Group>
            </Stack>
        </MantineModal>
    );
};
