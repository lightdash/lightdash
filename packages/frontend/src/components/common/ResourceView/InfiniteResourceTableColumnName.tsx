import {
    isResourceViewItemChart,
    isResourceViewItemDashboard,
    isResourceViewSpaceItem,
    type ResourceViewItem,
} from '@lightdash/common';
import { Anchor, Box, Group, Stack, Text, Tooltip } from '@mantine/core';
import {
    IconAlertTriangleFilled,
    IconChartBar,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { Link } from 'react-router';
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
                icon: IconAlertTriangleFilled,
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

    return (
        <Anchor
            component={Link}
            sx={{
                color: 'unset',
                ':hover': {
                    color: 'unset',
                    textDecoration: 'none',
                },
            }}
            to={getResourceUrl(projectUuid, item)}
            onClick={(e: React.MouseEvent<HTMLAnchorElement>) =>
                e.stopPropagation()
            }
        >
            <Group noWrap>
                <ResourceValidationErrorIndicator
                    item={item}
                    projectUuid={projectUuid}
                    canUserManageValidation={canUserManageValidation}
                    validationId={validationId}
                >
                    <ResourceIcon item={item} />
                </ResourceValidationErrorIndicator>

                <Stack spacing={2}>
                    <Group spacing="xs" noWrap>
                        <Text
                            fw={600}
                            lineClamp={1}
                            sx={{ overflowWrap: 'anywhere' }}
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
                        <Text fz={12} color="ldGray.6">
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
                        <Group spacing="xs" noWrap>
                            <ResourceAccessInfo
                                item={item}
                                type="secondary"
                                withTooltip
                            />
                            <Text fz={12} color="ldGray.6">
                                •
                            </Text>
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
                            </Group>
                        </Group>
                    )}
                </Stack>
            </Group>
        </Anchor>
    );
};

export default InfiniteResourceTableColumnName;
