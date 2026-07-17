import { type WeekDay } from '@lightdash/common';
import { useDisclosure } from '@mantine-8/hooks';
import { IconFilterExclamation } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import GuidedFilterSetup, {
    GuidedFilterSetupProgress,
} from './GuidedFilterSetup';
import { getFilterRequirementRules } from './utils';

type Props = {
    /** Applied to the modal root (embed passes its contract class) */
    className?: string;
    startOfWeek?: WeekDay;
    onDismiss: () => void;
};

const GuidedFilterSetupOverlay: FC<Props> = ({
    className,
    startOfWeek,
    onDismiss,
}) => {
    // Filter inputs report their dropdown state via popoverProps.onOpen/
    // onClose; Escape stands down while a dropdown is open so it only closes
    // the dropdown (the v6 date inputs don't set data-mantine-stop-propagation)
    const [isSubPopoverOpen, { open: openSubPopover, close: closeSubPopover }] =
        useDisclosure();

    const isLoadingDashboardFilters = useDashboardContext(
        (c) => c.isLoadingDashboardFilters,
    );
    const dashboard = useDashboardContext((c) => c.dashboard);
    const requiredFiltersNote = useDashboardContext(
        (c) => c.requiredFiltersNote,
    );
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);

    const rules = useMemo(
        () => getFilterRequirementRules(dashboardFilters),
        [dashboardFilters],
    );

    // Until the filterable fields arrive every member resolves an undefined
    // field, so inputs would render as the fallback type with validation
    // errors and then swap; hold the whole card back instead
    if (isLoadingDashboardFilters) return null;

    return (
        <MantineModal
            opened
            onClose={onDismiss}
            title={`Set filters to load ${dashboard?.name ?? 'this dashboard'}`}
            description={
                requiredFiltersNote ||
                'Data loads automatically once the filters below are set.'
            }
            icon={IconFilterExclamation}
            closeButtonLabel="Close setup"
            size={420}
            bodyScrollAreaMaxHeight="min(400px, 45vh)"
            footer={
                <GuidedFilterSetupProgress
                    rules={rules}
                    onDismiss={onDismiss}
                />
            }
            modalRootProps={{
                centered: false,
                yOffset: 'max(170px, 20vh)',
                closeOnEscape: !isSubPopoverOpen,
                transitionProps: { duration: 0 },
                className,
            }}
            modalContentProps={{
                'aria-label': 'Set filters to load this dashboard',
            }}
        >
            <GuidedFilterSetup
                rules={rules}
                startOfWeek={startOfWeek}
                onSubPopoverOpen={openSubPopover}
                onSubPopoverClose={closeSubPopover}
            />
        </MantineModal>
    );
};

export default GuidedFilterSetupOverlay;
