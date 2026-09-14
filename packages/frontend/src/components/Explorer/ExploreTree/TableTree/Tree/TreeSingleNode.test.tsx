import { FieldType, MetricType, type Metric } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import { createExplorerStore } from '../../../../../features/explorer/store';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { TreeSection } from '../Virtualization/types';
import TreeContext from './TreeContext';
import TreeSingleNode from './TreeSingleNode';
import { type TableTreeContext } from './types';

vi.mock('../../../../../hooks/useExplore', () => ({
    useExplore: () => ({ data: undefined }),
}));
vi.mock('../../../../../hooks/useFilters', () => ({
    useAddFilter: () => vi.fn(),
    useFilteredFields: () => ({ addFilter: vi.fn() }),
}));
vi.mock('../../../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));
vi.mock('../../../../../hooks/user/useCannotAuthorCustomSql', () => ({
    useCannotAuthorCustomSql: () => false,
}));
vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: false } }),
}));
vi.mock('../../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: vi.fn() }),
}));
vi.mock('../../../../../providers/App/useApp', () => ({
    default: () => ({
        health: { data: undefined },
        user: {
            data: {
                userUuid: 'user-uuid',
                organizationUuid: 'organization-uuid',
                ability: { can: () => true },
            },
        },
    }),
}));

// A metric declared without a `label:`, so its label is the dbt-friendly
// casing a walkthrough would name it by.
const METRIC: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.AVERAGE,
    name: 'average_payment_amount',
    label: 'Average payment amount',
    table: 'payments',
    tableLabel: 'Payments',
    sql: '${TABLE}.amount',
    hidden: false,
};

const KEY = 'payments_average_payment_amount';

const renderMetricRow = () => {
    const context: TableTreeContext = {
        itemsMap: { [KEY]: METRIC },
        nodeMap: {},
        isSearching: false,
        searchResults: [],
        onItemClick: vi.fn(),
        tableName: 'payments',
        treeSectionType: TreeSection.Metrics,
        expandedGroups: new Set<string>(),
        onToggleGroup: vi.fn(),
    };
    renderWithProviders(
        <Provider store={createExplorerStore()}>
            <TreeContext.Provider value={context}>
                <TreeSingleNode
                    node={{ key: KEY, label: METRIC.label, index: 0 }}
                />
            </TreeContext.Provider>
        </Provider>,
    );
};

// The generated walkthroughs point at one field by name, so the row has to
// carry the name the step was written against.
describe('TreeSingleNode tour anchors', () => {
    it('names the field the walkthrough is looking for', () => {
        renderMetricRow();

        const row = document.querySelector('[data-tour-anchor]');
        expect(row).toHaveAttribute('data-tour-anchor', 'explore-metric');
        expect(row).toHaveAttribute(
            'data-tour-value',
            'Average payment amount',
        );
        expect(screen.getByText('Average payment amount')).toBeInTheDocument();
    });
});
