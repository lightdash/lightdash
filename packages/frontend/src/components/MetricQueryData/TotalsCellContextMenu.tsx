import { isCustomDimension, isDimension } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import { useContextMenuPermissions } from '../../hooks/useContextMenuPermissions';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { useAccount } from '../../hooks/user/useAccount';
import MantineIcon from '../common/MantineIcon';
import { type TotalsCellContextMenuProps } from '../common/Table/types';
import { UnderlyingDataMenuItem } from '../DashboardTiles/UnderlyingDataMenuItem';
import DrillDownMenuItem from './DrillDownMenuItem';
import { useMetricQueryDataContext } from './useMetricQueryDataContext';

/**
 * Menu for a grand-total or subtotal cell. `fieldValues` carries the dimension
 * values the total is scoped to — empty for a grand total, so underlying data
 * and drill-down run against the chart's filters alone.
 */
const TotalsCellContextMenu: FC<
    TotalsCellContextMenuProps & { minimal?: boolean }
> = ({ totals: { item, value, fieldValues }, minimal = false }) => {
    const { openUnderlyingDataModal, metricQuery } =
        useMetricQueryDataContext();
    const { showToastSuccess } = useToaster();
    const { data: account } = useAccount();
    const projectUuid = useProjectUuid();
    const { canDrillInto } = useContextMenuPermissions({ minimal });
    const clipboard = useClipboard({ timeout: 200 });

    const handleCopyToClipboard = useCallback(() => {
        clipboard.copy(value.formatted);
        showToastSuccess({ title: 'Copied to clipboard!' });
    }, [clipboard, showToastSuccess, value.formatted]);

    const handleViewUnderlyingData = useCallback(() => {
        openUnderlyingDataModal({ item, value, fieldValues });
    }, [openUnderlyingDataModal, item, value, fieldValues]);

    return (
        <>
            <Menu.Item
                leftSection={
                    <MantineIcon icon={IconCopy} size="md" fillOpacity={0} />
                }
                onClick={handleCopyToClipboard}
            >
                Copy value
            </Menu.Item>

            {!isDimension(item) && !isCustomDimension(item) && metricQuery && (
                <UnderlyingDataMenuItem
                    metricQuery={metricQuery}
                    onViewUnderlyingData={handleViewUnderlyingData}
                />
            )}

            {!minimal && canDrillInto && (
                <DrillDownMenuItem
                    item={item}
                    fieldValues={fieldValues}
                    trackingData={{
                        organizationId: account?.organization?.organizationUuid,
                        userId: account?.user?.id,
                        projectId: projectUuid,
                    }}
                />
            )}
        </>
    );
};

export default TotalsCellContextMenu;
