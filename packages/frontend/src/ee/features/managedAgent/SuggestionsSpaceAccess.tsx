import { type ManagedAgentAudience } from '@lightdash/common';
import { Button, Group, SegmentedControl, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconUsers } from '@tabler/icons-react';
import { type FC } from 'react';
import ShareSpaceModal from '../../../components/common/ShareSpaceModal';
import { useSpace } from '../../../hooks/useSpaces';

const AUDIENCE_OPTIONS: { value: ManagedAgentAudience; label: string }[] = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'admins', label: 'Admins' },
];

/**
 * Access to Autopilot's suggestions is really access to the "Agent Suggestions"
 * space. Once that space exists it is the source of truth, so editing happens in
 * the space access modal; the audience policy only seeds the space on creation.
 */
export const SuggestionsSpaceAccess: FC<{
    projectUuid: string;
    spaceUuid: string | undefined;
    audience: ManagedAgentAudience;
    disabled: boolean;
    onAudienceChange: (audience: ManagedAgentAudience) => void;
}> = ({ projectUuid, spaceUuid, audience, disabled, onAudienceChange }) => {
    const { data: space } = useSpace(projectUuid, spaceUuid);
    const [modalOpened, { open: openModal, close: closeModal }] =
        useDisclosure(false);

    const description = (() => {
        if (!space) {
            return 'The "Agent Suggestions" space is created the first time Autopilot suggests content. This sets who can see it.';
        }
        return space.inheritParentPermissions
            ? 'All project members can see the "Agent Suggestions" space.'
            : 'Only admins and invited members can see the "Agent Suggestions" space.';
    })();

    return (
        <>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={3}>
                    <Text fz="xs" fw={500}>
                        Suggestions access
                    </Text>
                    <Text fz={11} c="dimmed">
                        {description}
                    </Text>
                </Stack>
                {space ? (
                    <Button
                        size="compact-xs"
                        variant="default"
                        leftSection={<IconUsers size={12} />}
                        onClick={openModal}
                    >
                        Manage access
                    </Button>
                ) : (
                    <SegmentedControl
                        size="xs"
                        value={audience}
                        onChange={(value) =>
                            onAudienceChange(value as ManagedAgentAudience)
                        }
                        data={AUDIENCE_OPTIONS}
                        disabled={disabled}
                    />
                )}
            </Group>

            {space && (
                <ShareSpaceModal
                    space={space}
                    projectUuid={projectUuid}
                    opened={modalOpened}
                    onClose={closeModal}
                />
            )}
        </>
    );
};
