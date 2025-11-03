import { subject } from '@casl/ability';
import { Button, Group, Text, Tooltip } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { memo, useCallback, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../../../../features/explorer/store';
import useApp from '../../../../../providers/App/useApp';
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
    const dispatch = useExplorerDispatch();

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

    // Section headers use simplified padding: depth * 20
    // (no base 12px like tree nodes)
    const pl = useMemo(() => {
        return depth ? `${depth * 20}px` : undefined;
    }, [depth]);

    const showAddButton =
        treeSection === TreeSection.Dimensions && canManageCustomSql;

    return (
        <Group mt="sm" mb="xs" pl={pl} pr="sm" position="apart">
            <Text fw={600} c={color}>
                {label}
            </Text>

            {showAddButton && (
                <Tooltip
                    label="Add a custom dimension with SQL"
                    variant="xs"
                    position="bottom"
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
    );
};

const VirtualSectionHeader = memo(VirtualSectionHeaderComponent);
VirtualSectionHeader.displayName = 'VirtualSectionHeader';

export default VirtualSectionHeader;
