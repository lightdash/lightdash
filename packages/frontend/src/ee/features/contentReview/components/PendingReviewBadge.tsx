import {
    getContentReviewRequestPath,
    type ContentReviewRequest,
} from '@lightdash/common';
import { Badge, Button, Group, Popover, Stack, Text } from '@mantine/core';
import { IconClockHour4 } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LightdashUserAvatar } from '../../../../components/Avatar';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import useApp from '../../../../providers/App/useApp';
import { useCancelContentReviewRequest } from '../hooks/useContentReviewRequests';
import { getUserFullName, getUserInitials } from '../utils';
import classes from './PendingReviewBadge.module.css';

type Props = {
    request: ContentReviewRequest;
};

const PendingReviewBadge: FC<Props> = ({ request }) => {
    const { t } = useTranslation('eeMisc');
    const { user } = useApp();
    const requestedAgo = useTimeAgo(new Date(request.createdAt));
    const { mutate: cancelRequest, isLoading: isCancelling } =
        useCancelContentReviewRequest(request.projectUuid);
    const isRequester = user.data?.userUuid === request.requestedBy.userUuid;

    return (
        <Popover position="bottom-start" shadow="md" withinPortal>
            <Popover.Target>
                <Badge
                    component="button"
                    color="yellow"
                    variant="light"
                    size="sm"
                    radius="sm"
                    tt="none"
                    fw={500}
                    leftSection={
                        <MantineIcon icon={IconClockHour4} size={12} />
                    }
                    className={classes.badge}
                >
                    {t('contentReview.pendingBadge.label')}
                </Badge>
            </Popover.Target>
            <Popover.Dropdown w={320} p="sm">
                <Stack gap="sm">
                    <Group gap="sm" wrap="nowrap" align="flex-start">
                        <LightdashUserAvatar
                            size="sm"
                            userUuid={request.requestedBy.userUuid}
                        >
                            {getUserInitials(request.requestedBy)}
                        </LightdashUserAvatar>
                        <Stack gap={2}>
                            <Text fz="sm" fw={500}>
                                {t('contentReview.status.pending')}
                            </Text>
                            <Text fz="xs" c="dimmed">
                                {isRequester
                                    ? t('contentReview.pendingBadge.youAsked', {
                                          ago: requestedAgo,
                                      })
                                    : t(
                                          'contentReview.pendingBadge.userAsked',
                                          {
                                              name: getUserFullName(
                                                  request.requestedBy,
                                              ),
                                              ago: requestedAgo,
                                          },
                                      )}
                            </Text>
                        </Stack>
                    </Group>
                    <Group gap="xs" justify="flex-end">
                        {isRequester && (
                            <Button
                                variant="subtle"
                                color="red"
                                size="xs"
                                loading={isCancelling}
                                onClick={() => cancelRequest(request.uuid)}
                            >
                                {t('contentReview.cancelRequest')}
                            </Button>
                        )}
                        <Button
                            component={Link}
                            to={getContentReviewRequestPath(
                                request.projectUuid,
                                request.uuid,
                            )}
                            variant="default"
                            size="xs"
                        >
                            {t('contentReview.pendingBadge.openRequest')}
                        </Button>
                    </Group>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export default PendingReviewBadge;
