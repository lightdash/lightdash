import { isMetric } from '@lightdash/common';
import { useMemo, type FC, type ReactNode } from 'react';
import { useContextSelector } from 'use-context-selector';
import DashboardContext from '../../providers/Dashboard/context';
import { useDashboardControls } from './context';
import { commitFilterControl, commitParameterControl } from './controlDraft';
import { hasFilterField } from './filterMapping';

// A previewed tile runs with the control's draft applied: inside this scope
// the dashboard's filters, parameter values and controls are the draft's
const ControlPreviewScope: FC<{ children: ReactNode }> = ({ children }) => {
    const { draft, model, parameterControls, draftsTemporaryFilters } =
        useDashboardControls();
    const dashboard = useContextSelector(DashboardContext, (c) => c);
    const field = model?.field;

    const value = useMemo(() => {
        if (!dashboard || !draft) return dashboard;
        if (draft.kind === 'filter') {
            if (!hasFilterField(draft.rule)) return dashboard;
            // While viewing the draft is a temporary filter
            const filtersKey = draftsTemporaryFilters
                ? 'dashboardTemporaryFilters'
                : 'dashboardFilters';
            return {
                ...dashboard,
                [filtersKey]: commitFilterControl(
                    dashboard[filtersKey],
                    draft.rule,
                    field && isMetric(field) ? 'metrics' : 'dimensions',
                ),
            };
        }
        const { control } = draft;
        const previousKeys =
            parameterControls.find((c) => c.id === control.id)?.parameterKeys ??
            [];
        const parameterValues = { ...dashboard.parameterValues };
        // What the tile's source text reads: the saved values under the
        // draft's, as the query runs with
        const appliedParameterValues = { ...dashboard.appliedParameterValues };
        [...previousKeys, ...control.parameterKeys].forEach((key) => {
            if (draft.value !== null && control.parameterKeys.includes(key)) {
                parameterValues[key] = draft.value;
                appliedParameterValues[key] = draft.value;
            } else {
                delete parameterValues[key];
                const savedValue =
                    dashboard.dashboard?.parameters?.[key]?.value;
                if (savedValue === undefined) {
                    delete appliedParameterValues[key];
                } else {
                    appliedParameterValues[key] = savedValue;
                }
            }
        });
        return {
            ...dashboard,
            parameterValues,
            appliedParameterValues,
            parameterControls: commitParameterControl(
                parameterControls,
                control,
            ),
        };
    }, [dashboard, draft, field, parameterControls, draftsTemporaryFilters]);

    return (
        <DashboardContext.Provider value={value}>
            {children}
        </DashboardContext.Provider>
    );
};

export default ControlPreviewScope;
