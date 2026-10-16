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
import { type TFunction } from 'i18next';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';
import ShareSpaceModal from '../../../components/common/ShareSpaceModal';
import { useSpaceAccess } from '../../../hooks/useSpaceAccess';
import { useSpace, useSpaceSummaries } from '../../../hooks/useSpaces';

const getAudienceOptions = (
    t: TFunction,
): { value: ManagedAgentAudience; label: string }[] => [
    { value: 'everyone', label: t('suggestionsAccess.audience.everyone') },
    { value: 'admins', label: t('suggestionsAccess.audience.admins') },
];

const describeRestrictedAccess = (
    t: TFunction,
    space: Space,
    memberCount: number,
) => {
    const members = t('suggestionsAccess.memberCount', { count: memberCount });
    if (space.groupsAccess.length > 0) {
        return t('suggestionsAccess.restrictedWithGroups', {
            members,
            groups: t('suggestionsAccess.groupCount', {
                count: space.groupsAccess.length,
            }),
        });
    }
    return t('suggestionsAccess.restricted', { members });
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
    const { t } = useTranslation('managedAgent');
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
        if (isLoading) return t('suggestionsAccess.checking');
        if (!space) {
            return t('suggestionsAccess.notCreated');
        }
        return space.inheritParentPermissions
            ? t('suggestionsAccess.everyoneCanSee')
            : describeRestrictedAccess(
                  t,
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
                            {t('suggestionsAccess.title')}
                        </Text>
                        {space && (
                            <Badge
                                size="xs"
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
                                    ? t('suggestionsAccess.badge.everyone')
                                    : t('suggestionsAccess.badge.restricted')}
                            </Badge>
                        )}
                    </Group>
                    <Text fz="xs" c="dimmed">
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
                        {t('suggestionsAccess.manageAccess')}
                    </Button>
                ) : (
                    <SegmentedControl
                        size="xs"
                        value={audience}
                        onChange={(value) =>
                            onAudienceChange(value as ManagedAgentAudience)
                        }
                        data={getAudienceOptions(t)}
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
