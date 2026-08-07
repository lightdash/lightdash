import {
    AGENT_SUGGESTIONS_SPACE_SLUG,
    type ManagedAgentAudience,
    type Space,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Group,
    SegmentedControl,
    Skeleton,
    Stack,
    Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconLock, IconUsers } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import ShareSpaceModal from '../../../components/common/ShareSpaceModal';
import { useSpaceAccess } from '../../../hooks/useSpaceAccess';
import { useSpace, useSpaceSummaries } from '../../../hooks/useSpaces';

const AUDIENCE_OPTIONS: { value: ManagedAgentAudience; label: string }[] = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'admins', label: 'Admins' },
];

const countLabel = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;

const describeRestrictedAccess = (space: Space, memberCount: number) => {
    const parts = [countLabel(memberCount, 'member')];
    if (space.groupsAccess.length > 0) {
        parts.push(countLabel(space.groupsAccess.length, 'group'));
    }
    return `${parts.join(' and ')} can see suggestions.`;
};

/**
 * Access to Autopilot's suggestions is really access to the "Agent Suggestions"
 * space. Once that space exists it is the source of truth, so editing happens in
 * the space access modal; the audience policy only seeds the space on creation.
 */
export const SuggestionsSpaceAccess: FC<{
    projectUuid: string;
    audience: ManagedAgentAudience;
    disabled: boolean;
    onAudienceChange: (audience: ManagedAgentAudience) => void;
}> = ({ projectUuid, audience, disabled, onAudienceChange }) => {
    const { data: spaceSummaries, isInitialLoading: isLoadingSummaries } =
        useSpaceSummaries(projectUuid, true);
    const spaceUuid = useMemo(
        () =>
            spaceSummaries?.find(
                (summary) => summary.slug === AGENT_SUGGESTIONS_SPACE_SLUG,
            )?.uuid,
        [spaceSummaries],
    );
    const { data: space, isInitialLoading: isLoadingSpace } = useSpace(
        projectUuid,
        spaceUuid,
    );
    const { data: spaceAccess } = useSpaceAccess(projectUuid, spaceUuid, {
        page: 1,
        pageSize: 1,
    });
    const [modalOpened, { open: openModal, close: closeModal }] =
        useDisclosure(false);

    // Both queries resolve after mount. Without this the row renders the
    // "not created yet" control first and then swaps, which reads as a glitch.
    const isLoading = isLoadingSummaries || isLoadingSpace;

    const description = (() => {
        if (isLoading) return 'Checking who can see suggestions…';
        if (!space) {
            return 'The "Agent Suggestions" space is created the first time Autopilot suggests content. This sets who can see it.';
        }
        return space.inheritParentPermissions
            ? 'Everyone on this project can see suggestions.'
            : describeRestrictedAccess(
                  space,
                  spaceAccess?.pagination?.totalResults ?? 0,
              );
    })();

    return (
        <>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={3}>
                    <Group gap="xs">
                        <Text fz="xs" fw={500}>
                            Suggestions access
                        </Text>
                        {space && (
                            <Badge
                                size="xs"
                                variant="light"
                                color={
                                    space.inheritParentPermissions
                                        ? 'gray'
                                        : 'orange'
                                }
                                leftSection={
                                    <MantineIcon
                                        icon={
                                            space.inheritParentPermissions
                                                ? IconUsers
                                                : IconLock
                                        }
                                        size={10}
                                    />
                                }
                            >
                                {space.inheritParentPermissions
                                    ? 'Everyone'
                                    : 'Restricted'}
                            </Badge>
                        )}
                    </Group>
                    <Text fz={11} c="dimmed">
                        {description}
                    </Text>
                </Stack>

                {isLoading ? (
                    <Skeleton height={26} width={110} radius="sm" />
                ) : space ? (
                    <Button
                        size="compact-xs"
                        variant="default"
                        leftSection={<MantineIcon icon={IconUsers} size={12} />}
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
