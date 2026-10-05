import { ActionIcon, Tooltip } from '@mantine/core';
import { IconRotate2 } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import AddControlButton from './AddControlButton';
import { NewControlPill } from './ControlPills';

// A viewer's way back to the dashboard as it was saved
const ResetFiltersButton: FC = () => {
    const getUiString = useUiStrings();
    const hasChanges = useDashboardContext(
        (c) =>
            c.haveFiltersChanged ||
            c.dashboardTemporaryFilters.dimensions.length > 0 ||
            c.dashboardTemporaryFilters.metrics.length > 0,
    );
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );
    const resetDashboardFilters = useDashboardContext(
        (c) => c.resetDashboardFilters,
    );
    if (!hasChanges) return null;

    return (
        <Tooltip label={getUiString('filters.resetAll')}>
            <ActionIcon
                data-dashboard-filter-control
                aria-label={getUiString('filters.resetAll')}
                onClick={() => {
                    setHaveFiltersChanged(false);
                    resetDashboardFilters();
                }}
            >
                <MantineIcon icon={IconRotate2} color="dimmed" />
            </ActionIcon>
        </Tooltip>
    );
};

// "Add control" leads the bar, where the add button has always been.
// Editors always add; viewers unless adding is hidden from them
export const ControlsBarStart: FC<{ isEditMode: boolean }> = ({
    isEditMode,
}) => {
    const isAddFilterDisabled = useDashboardContext(
        (c) => c.isAddFilterDisabled,
    );
    if (!isEditMode && isAddFilterDisabled) return null;
    return <AddControlButton />;
};

// What follows the pills: the new control's pill and a viewer's reset.
// Coming last, neither moves a pill when it appears.
const ControlsBarEnd: FC<{ isEditMode: boolean }> = ({ isEditMode }) => (
    <>
        <NewControlPill />
        {!isEditMode && <ResetFiltersButton />}
    </>
);

export default ControlsBarEnd;
