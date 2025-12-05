import { subject } from '@casl/ability';
import { FeatureFlags, isCustomSqlDimension } from '@lightdash/common';
import { ActionIcon, Button, Group, Text, Tooltip } from '@mantine/core';
import { IconCode, IconPlus } from '@tabler/icons-react';
import { memo, useCallback, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import {
    explorerActions,
    selectAdditionalMetrics,
    selectCustomDimensions,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../../../features/explorer/store';
import { useFeatureFlagEnabled } from '../../../../../hooks/useFeatureFlagEnabled';
import useApp from '../../../../../providers/App/useApp';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import DocumentationHelpButton from '../../../../DocumentationHelpButton';
import MantineIcon from '../../../../common/MantineIcon';
import { TreeSection, type SectionHeaderItem } from './types';

interface VirtualSectionHeaderProps {
    item: SectionHeaderItem;
}

/**
 * Renders a section header (Dimensions, Metrics, etc.) in the virtualized tree
 */
const VirtualSectionHeaderComponent: FC<VirtualSectionHeaderProps> = ({
    item,
}) => {
    const { label, color, depth, tableName, treeSection, helpButton } =
        item.data;
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user } = useApp();
    const { track } = useTracking();
    const dispatch = useExplorerDispatch();

    // Get all custom metrics and dimensions for write-back
    const allAdditionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const allCustomDimensions = useExplorerSelector(selectCustomDimensions);

    // Feature flag for bin dimensions write-back
    const isWriteBackCustomBinDimensionsEnabled = useFeatureFlagEnabled(
        FeatureFlags.WriteBackCustomBinDimensions,
    );

    // Filter custom dimensions based on feature flag
    const customDimensionsToWriteBack = useMemo(() => {
        if (!allCustomDimensions) return [];
        return isWriteBackCustomBinDimensionsEnabled
            ? allCustomDimensions
            : allCustomDimensions.filter(isCustomSqlDimension);
    }, [allCustomDimensions, isWriteBackCustomBinDimensionsEnabled]);

    const canManageCustomSql = user.data?.ability?.can(
        'manage',
        subject('CustomSql', {
            organizationUuid: user.data.organizationUuid,
            projectUuid,
        }),
    );

    const handleAddCustomDimension = useCallback(() => {
        dispatch(
            explorerActions.toggleCustomDimensionModal({
                isEditing: false,
                table: tableName,
                item: undefined,
            }),
        );
    }, [dispatch, tableName]);

    const handleWriteBackCustomMetrics = useCallback(() => {
        if (projectUuid && user.data?.organizationUuid) {
            track({
                name: EventName.WRITE_BACK_FROM_CUSTOM_METRIC_HEADER_CLICKED,
                properties: {
                    userId: user.data.userUuid,
                    projectId: projectUuid,
                    organizationId: user.data.organizationUuid,
                    customMetricsCount: allAdditionalMetrics?.length || 0,
                    customDimensionsCount: 0,
                },
            });
        }
        dispatch(
            explorerActions.toggleWriteBackModal({
                items: allAdditionalMetrics,
            }),
        );
    }, [projectUuid, user.data, allAdditionalMetrics, dispatch, track]);

    const handleWriteBackCustomDimensions = useCallback(() => {
        if (projectUuid && user.data?.organizationUuid) {
            track({
                name: EventName.WRITE_BACK_FROM_CUSTOM_DIMENSION_HEADER_CLICKED,
                properties: {
                    userId: user.data.userUuid,
                    projectId: projectUuid,
                    organizationId: user.data.organizationUuid,
                    customMetricsCount: 0,
                    customDimensionsCount:
                        customDimensionsToWriteBack?.length || 0,
                },
            });
        }
        dispatch(
            explorerActions.toggleWriteBackModal({
                items: customDimensionsToWriteBack || [],
            }),
        );
    }, [projectUuid, user.data, customDimensionsToWriteBack, dispatch, track]);

    // Section headers use simplified padding: depth * 20
    // (no base 12px like tree nodes)
    const pl = useMemo(() => {
        return depth ? `${depth * 20}px` : undefined;
    }, [depth]);

    const showAddButton =
        treeSection === TreeSection.Dimensions && canManageCustomSql;

    const showWriteBackCustomMetrics =
        treeSection === TreeSection.CustomMetrics &&
        allAdditionalMetrics &&
        allAdditionalMetrics.length > 0;

    const showWriteBackCustomDimensions =
        treeSection === TreeSection.CustomDimensions &&
        customDimensionsToWriteBack.length > 0;

    return (
        <Group mt="sm" mb="xs" pl={pl} pr="sm" position="apart">
            <Group spacing="xs">
                <Text fw={600} c={color}>
                    {label}
                </Text>
                {helpButton && (
                    <DocumentationHelpButton
                        href={helpButton.href}
                        tooltipProps={{
                            label: helpButton.tooltipText,
                            multiline: true,
                        }}
                    />
                )}
            </Group>

            <Group spacing="xs">
                {showAddButton && (
                    <Tooltip
                        label="Add a custom dimension with SQL"
                        variant="xs"
                        position="left"
                    >
                        <Button
                            size="xs"
                            variant="subtle"
                            compact
                            leftIcon={<MantineIcon icon={IconPlus} />}
                            onClick={handleAddCustomDimension}
                            data-testid="VirtualSectionHeader/AddCustomDimensionButton"
                        >
                            Add
                        </Button>
                    </Tooltip>
                )}

                {showWriteBackCustomMetrics && (
                    <Tooltip label="Write back custom metrics">
                        <ActionIcon
                            onClick={handleWriteBackCustomMetrics}
                            data-testid="VirtualSectionHeader/WriteBackCustomMetricsButton"
                        >
                            <MantineIcon icon={IconCode} />
                        </ActionIcon>
                    </Tooltip>
                )}

                {showWriteBackCustomDimensions && (
                    <Tooltip label="Write back custom dimensions">
                        <ActionIcon
                            onClick={handleWriteBackCustomDimensions}
                            data-testid="VirtualSectionHeader/WriteBackCustomDimensionsButton"
                        >
                            <MantineIcon icon={IconCode} />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Group>
        </Group>
    );
};

const VirtualSectionHeader = memo(VirtualSectionHeaderComponent);
VirtualSectionHeader.displayName = 'VirtualSectionHeader';

export default VirtualSectionHeader;
