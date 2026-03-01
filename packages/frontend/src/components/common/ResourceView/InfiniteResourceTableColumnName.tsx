import {
    FeatureFlags,
    isResourceViewItemChart,
    isResourceViewItemDashboard,
    isResourceViewSpaceItem,
    type ContentVerificationInfo,
    type ResourceViewItem,
} from '@lightdash/common';
import { Anchor, Box, Group, Stack, Text, Tooltip } from '@mantine-8/core';
import {
    IconAlertTriangle,
    IconChartBar,
    IconCircleCheckFilled,
    IconFolder,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { Link } from 'react-router';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { ResourceIcon, ResourceIndicator } from '../ResourceIcon';
import { ResourceInfoPopup } from '../ResourceInfoPopup/ResourceInfoPopup';
import ResourceAccessInfo from './ResourceAccessInfo';
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
    validationId?: number;
};

/**
 * Wraps the provided children with a validation error indicator if the resource has validation errors
 */
const ResourceValidationErrorIndicator = ({
    item,
    projectUuid,
    canUserManageValidation,
    children,
    validationId,
}: ResourceValidationErrorIndicatorProps) => {
    if (!validationId) {
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
                                search: `?validationId=${validationId}`,
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

type ResourceVerifiedIndicatorProps = {
    verification: ContentVerificationInfo | null;
    children: React.ReactNode;
};

/**
 * Wraps the provided children with a verified indicator if the resource is verified.
 * Should NOT be used when validation errors are present (errors take precedence).
 */
const ResourceVerifiedIndicator = ({
    verification,
    children,
}: ResourceVerifiedIndicatorProps) => {
    if (!verification) {
        return children;
    }

    const verifiedDate = new Date(verification.verifiedAt).toLocaleDateString();

    return (
        <ResourceIndicator
            iconProps={{
                icon: IconCircleCheckFilled,
                color: 'green.6',
            }}
            tooltipProps={{
                maw: 300,
                withinPortal: true,
                multiline: true,
                offset: -2,
                position: 'bottom',
            }}
            tooltipLabel={
                <>
                    Verified by {verification.verifiedBy.firstName}{' '}
                    {verification.verifiedBy.lastName} on {verifiedDate}
                </>
            }
        >
            {children}
        </ResourceIndicator>
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
    const { data: nestedSpacesPermissionsFlag } = useServerFeatureFlag(
        FeatureFlags.NestedSpacesPermissions,
    );
    const isV2 = !!nestedSpacesPermissionsFlag?.enabled;

    const isSpace = isResourceViewSpaceItem(item);
    const isChartOrDashboard =
        isResourceViewItemChart(item) || isResourceViewItemDashboard(item);

    const hasValidationErrors =
        isChartOrDashboard &&
        item.data.validationErrors &&
        item.data.validationErrors.length > 0;

    const validationId = hasValidationErrors
        ? item.data.validationErrors![0].validationId
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
                    validationId={validationId}
                >
                    <ResourceVerifiedIndicator verification={verification}>
                        <ResourceIcon item={item} />
                    </ResourceVerifiedIndicator>
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
                    {isChartOrDashboard && (
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
                            {!isV2 && (
                                <>
                                    <ResourceAccessInfo
                                        item={item}
                                        type="secondary"
                                        withTooltip
                                    />
                                    <Text fz={12} c="ldGray.6">
                                        &bull;
                                    </Text>
                                </>
                            )}
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
