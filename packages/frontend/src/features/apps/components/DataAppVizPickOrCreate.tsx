import { type ItemsMap } from '@lightdash/common';
import { Anchor, Button, Group, Stack, Text } from '@mantine-8/core';
import { IconSparkles } from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { type VizPromptColumn } from '../utils/buildVizGenerationPrompt';
import DataAppVizConversation from './DataAppVizConversation';

type Props = {
    /** The library picker, shown only in `pick` mode. */
    picker: ReactNode;
    projectUuid: string;
    itemsMap: ItemsMap;
    isBuilding: boolean;
    pendingPrompt: string | null;
    error: string | null;
    onRetry: (() => void) | null;
    onSubmit: (description: string, columns: VizPromptColumn[]) => void;
};

/**
 * What the config panel shows when no visualization is picked yet: two modes,
 * never both at once.
 *
 * `pick` — the library picker plus a way into authoring. Reuse is the common
 * case, so a composer does not sit open competing with the picker.
 * `create` — the composer alone. Describing a new visualization is a different
 * job from choosing an existing one, and showing the picker underneath invites
 * you to abandon a half-written description by accident.
 */
const DataAppVizPickOrCreate: FC<Props> = ({
    picker,
    projectUuid,
    itemsMap,
    isBuilding,
    pendingPrompt,
    error,
    onRetry,
    onSubmit,
}) => {
    const [isCreating, setIsCreating] = useState(false);
    // A build outlives an explicit close, so progress can't be dismissed away.
    const inCreateMode = isCreating || isBuilding;

    if (!inCreateMode) {
        return (
            <Stack gap="sm">
                {picker}
                <Button
                    variant="default"
                    size="xs"
                    fullWidth
                    leftSection={<MantineIcon icon={IconSparkles} />}
                    onClick={() => setIsCreating(true)}
                >
                    Create new visualization
                </Button>
            </Stack>
        );
    }

    return (
        <Stack gap="xs">
            <Group justify="space-between" align="center">
                <Text size="sm" fw={500}>
                    Create new visualization
                </Text>
                {!isBuilding && (
                    <Anchor
                        component="button"
                        type="button"
                        size="xs"
                        c="dimmed"
                        onClick={() => setIsCreating(false)}
                    >
                        Cancel
                    </Anchor>
                )}
            </Group>

            <DataAppVizConversation
                projectUuid={projectUuid}
                dataAppVizUuid={null}
                composer={{
                    itemsMap,
                    placeholder: 'Describe a new visualization…',
                    isBuilding,
                    pendingPrompt,
                    error,
                    onRetry,
                    onSubmit,
                }}
            />
        </Stack>
    );
};

export default DataAppVizPickOrCreate;
