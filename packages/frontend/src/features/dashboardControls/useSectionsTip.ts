import { useLocalStorage } from '@mantine/hooks';
import {
    selectControlSections,
    selectDashboardFilters,
    useDashboardSelector,
} from '../dashboard/store';

// Shown while the dashboard has 2+ filters, no section, and it was not
// dismissed; the bar reads it too, for the section created event
export const useSectionsTip = () => {
    const [isDismissed, setIsDismissed] = useLocalStorage({
        key: 'dashboard-controls-sections-tip-dismissed',
        defaultValue: false,
        getInitialValueInEffect: false,
    });
    const hasSections = useDashboardSelector(
        (state) => selectControlSections(state).length > 0,
    );
    const filterCount = useDashboardSelector((state) => {
        const { dimensions, metrics } = selectDashboardFilters(state);
        return dimensions.length + metrics.length;
    });
    return {
        isShown: !isDismissed && !hasSections && filterCount >= 2,
        filterCount,
        dismiss: () => setIsDismissed(true),
    };
};
