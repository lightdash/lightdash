import {
    DimensionType,
    FieldType,
    MetricType,
    TimeFrames,
    timeFrameConfigs,
    type Dimension,
    type Metric,
} from '@lightdash/common';
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

// A date dimension at a time interval: the row shows the interval's name,
// not the field's own label.
const MONTH_DIMENSION: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.DATE,
    name: 'order_date_month',
    label: 'Order date month',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.order_date',
    hidden: false,
    timeInterval: TimeFrames.MONTH,
};

// Nothing in the dbt project named it, so the row falls back to the field
// name as written.
const UNLABELLED_DIMENSION: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'payment_method',
    label: '',
    table: 'payments',
    tableLabel: 'Payments',
    sql: '${TABLE}.payment_method',
    hidden: false,
};

const renderRow = (item: Dimension | Metric) => {
    const key = `${item.table}_${item.name}`;
    const context: TableTreeContext = {
        itemsMap: { [key]: item },
        nodeMap: {},
        isSearching: false,
        searchResults: [],
        onItemClick: vi.fn(),
        tableName: item.table,
        treeSectionType: TreeSection.Metrics,
        expandedGroups: new Set<string>(),
        onToggleGroup: vi.fn(),
    };
    renderWithProviders(
        <Provider store={createExplorerStore()}>
            <TreeContext.Provider value={context}>
                <TreeSingleNode node={{ key, label: item.label, index: 0 }} />
            </TreeContext.Provider>
        </Provider>,
    );
};

/**
 * A walkthrough step is written from what the learner can see, so the row
 * has to be named after the text it renders, whatever that text came from.
 */
const expectRowNamed = (anchor: string, onScreen: string) => {
    const row = document.querySelector('[data-tour-anchor]');
    expect(row).toHaveAttribute('data-tour-anchor', anchor);
    expect(row).toHaveAttribute('data-tour-value', onScreen);
    expect(screen.getByText(onScreen)).toBeInTheDocument();
};

describe('TreeSingleNode tour anchors', () => {
    it('names a metric after its label', () => {
        renderRow(METRIC);

        expectRowNamed('explore-metric', 'Average payment amount');
    });

    it('names a time-interval dimension after the interval, not the field label', () => {
        renderRow(MONTH_DIMENSION);

        expectRowNamed(
            'explore-dimension',
            timeFrameConfigs[TimeFrames.MONTH].getLabel(),
        );
    });

    it('names an unlabelled field after the name the row falls back to', () => {
        renderRow(UNLABELLED_DIMENSION);

        expectRowNamed('explore-dimension', 'payment_method');
    });
});
