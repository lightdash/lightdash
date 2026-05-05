import {
    FeatureFlags,
    isResourceViewDataAppItem,
    isResourceViewItemChart,
    isResourceViewItemDashboard,
    isResourceViewSpaceItem,
    type ContentVerificationInfo,
    type ResourceViewItem,
} from '@lightdash/common';
import { Anchor, Box, Group, Stack, Text, Tooltip } from '@mantine-8/core';
import {
    IconAlertTriangle,
    IconAppWindow,
    IconChartBar,
    IconCircleCheckFilled,
    IconFolder,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { Link } from 'react-router';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../MantineIcon';
import { ResourceIcon, ResourceIndicator } from '../ResourceIcon';
import { ResourceInfoPopup } from '../ResourceInfoPopup/ResourceInfoPopup';
import AttributeCount from './ResourceAttributeCount';
import {
    getResourceTypeName,
    getResourceUrl,
    getResourceViewsSinceWhenDescription,
} from './resourceUtils';

type ResourceValidationErrorIndicatorProps = {
    item: ResourceViewItem;
    projectUuid: string;
    canUserManageValidation: boolean;
    children: React.ReactNode;
    validationUuid?: string;
};

/**
 * Wraps the provided children with a validation error indicator if the resource has validation errors
 */
const ResourceValidationErrorIndicator = ({
    item,
    projectUuid,
    canUserManageValidation,
    children,
    validationUuid,
}: ResourceValidationErrorIndicatorProps) => {
    if (!validationUuid) {
        return children;
    }

    return (
        <ResourceIndicator
            iconProps={{
                icon: IconAlertTriangle,
                color: 'red',
            }}
            tooltipProps={{
                maw: 300,
                withinPortal: true,
                multiline: true,
                offset: -2,
                position: 'bottom',
            }}
            tooltipLabel={
                canUserManageValidation ? (
                    <>
                        This content is broken. Learn more about the validation
                        error(s){' '}
                        <Anchor
                            component={Link}
                            fw={600}
                            to={{
                                pathname: `/generalSettings/projectManagement/${projectUuid}/validator`,
                                search: `?validationUuid=${validationUuid}`,
                            }}
                            color="blue.4"
                            fz="xs"
                        >
                            here
                        </Anchor>
                        .
                    </>
                ) : (
                    <>
                        There's an error with this{' '}
                        {isResourceViewItemChart(item) ? 'chart' : 'dashboard'}.
                    </>
                )
            }
        >
            {children}
        </ResourceIndicator>
    );
};

type ResourceVerifiedInlineBadgeProps = {
    verification: ContentVerificationInfo | null;
};

/**
 * Inline verified badge rendered next to the resource title (Instagram-style).
 * Renders nothing when the resource is not verified.
 */
const ResourceVerifiedInlineBadge = ({
    verification,
}: ResourceVerifiedInlineBadgeProps) => {
    if (!verification) {
        return null;
    }

    const verifiedDate = new Date(verification.verifiedAt).toLocaleDateString();

    return (
        <Tooltip
            withinPortal
            multiline
            maw={300}
            position="bottom"
            label={
                <>
                    Verified by {verification.verifiedBy.firstName}{' '}
                    {verification.verifiedBy.lastName} on {verifiedDate}
                </>
            }
        >
            <Box component="span" lh={0} c="green.6">
                <MantineIcon icon={IconCircleCheckFilled} size={16} />
            </Box>
        </Tooltip>
    );
};

type InfiniteResourceTableColumnNameProps = {
    item: ResourceViewItem;
    projectUuid: string;
    canUserManageValidation: boolean;
};

const InfiniteResourceTableColumnName = ({
    item,
    projectUuid,
    canUserManageValidation,
}: InfiniteResourceTableColumnNameProps) => {
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const dataAppsEnabled = dataAppsFlag.data?.enabled ?? false;
    const isSpace = isResourceViewSpaceItem(item);
    const isChartOrDashboard =
        isResourceViewItemChart(item) || isResourceViewItemDashboard(item);
    const showTypeAndViews =
        isChartOrDashboard || isResourceViewDataAppItem(item);

    const hasValidationErrors =
        isChartOrDashboard &&
        item.data.validationErrors &&
        item.data.validationErrors.length > 0;

    const validationUuid = hasValidationErrors
        ? item.data.validationErrors![0].validationUuid
        : undefined;

    const verification =
        isChartOrDashboard && !hasValidationErrors
            ? item.data.verification
            : null;

    return (
        <Anchor
            component={Link}
            c="unset"
            underline="never"
            to={getResourceUrl(projectUuid, item)}
            onClick={(e: React.MouseEvent<HTMLAnchorElement>) =>
                e.stopPropagation()
            }
        >
            <Group wrap="nowrap">
                <ResourceValidationErrorIndicator
                    item={item}
                    projectUuid={projectUuid}
                    canUserManageValidation={canUserManageValidation}
                    validationUuid={validationUuid}
                >
                    <ResourceIcon item={item} />
                </ResourceValidationErrorIndicator>

                <Stack gap={2}>
                    <Group gap="xs" wrap="nowrap">
                        <Text
                            fw={600}
                            lineClamp={1}
                            style={{ overflowWrap: 'anywhere' }}
                        >
                            {item.data.name}
                        </Text>
                        <ResourceVerifiedInlineBadge
                            verification={verification}
                        />
                        {!isSpace &&
                            // If there is no description, don't show the info icon on dashboards.
                            // For charts we still show it for the dashboard list
                            (item.data.description ||
                                isResourceViewItemChart(item)) &&
                            isChartOrDashboard && (
                                <Box>
                                    <ResourceInfoPopup
                                        resourceUuid={item.data.uuid}
                                        projectUuid={projectUuid}
                                        description={item.data.description}
                                        withChartData={isResourceViewItemChart(
                                            item,
                                        )}
                                    />
                                </Box>
                            )}
                    </Group>
                    {showTypeAndViews && (
                        <Text fz={12} c="ldGray.6">
                            {getResourceTypeName(item)} •{' '}
                            <Tooltip
                                position="top-start"
                                disabled={
                                    !item.data.views || !item.data.firstViewedAt
                                }
                                label={getResourceViewsSinceWhenDescription(
                                    item,
                                )}
                            >
                                <span>{item.data.views || '0'} views</span>
                            </Tooltip>
                        </Text>
                    )}
                    {isSpace && item.data.parentSpaceUuid && (
                        <Group gap="xs" wrap="nowrap">
                            <Group>
                                <AttributeCount
                                    Icon={IconLayoutDashboard}
                                    count={item.data.dashboardCount}
                                    name="Dashboards"
                                />
                                <AttributeCount
                                    Icon={IconChartBar}
                                    count={item.data.chartCount}
                                    name="Charts"
                                />
                                {dataAppsEnabled && (
                                    <AttributeCount
                                        Icon={IconAppWindow}
                                        count={item.data.appCount}
                                        name="Data apps"
                                    />
                                )}
                                <AttributeCount
                                    Icon={IconFolder}
                                    count={item.data.childSpaceCount}
                                    name="Spaces"
                                />
                            </Group>
                        </Group>
                    )}
                </Stack>
            </Group>
        </Anchor>
    );
};

export default InfiniteResourceTableColumnName;
