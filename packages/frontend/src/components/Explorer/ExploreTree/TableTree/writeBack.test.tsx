import {
    BinType,
    CustomDimensionType,
    type CustomBinDimension,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import {
    createExplorerStore,
    explorerActions,
} from '../../../../features/explorer/store';
import { renderWithProviders } from '../../../../testing/testUtils';
import TreeSingleNodeActions from './Tree/TreeSingleNodeActions';
import {
    ITEM_HEIGHTS,
    TreeSection,
    type SectionHeaderItem,
} from './Virtualization/types';
import VirtualSectionHeader from './Virtualization/VirtualSectionHeader';

vi.mock('../../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));
vi.mock('../../../../hooks/user/useCannotAuthorCustomSql', () => ({
    useCannotAuthorCustomSql: () => false,
}));
vi.mock('../../../../hooks/useFilters', () => ({
    useFilteredFields: () => ({ addFilter: vi.fn() }),
}));
vi.mock('../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));
vi.mock('../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: vi.fn() }),
}));
vi.mock('../../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));
vi.mock('../../../../providers/App/useApp', () => ({
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

const makeBin = (binType: BinType): CustomBinDimension => {
    const base = {
        id: 'amount_range',
        name: 'Amount range',
        table: 'orders',
        type: CustomDimensionType.BIN as const,
        dimensionId: 'orders_amount',
    };
    switch (binType) {
        case BinType.FIXED_NUMBER:
            return { ...base, binType, binNumber: 5 };
        case BinType.FIXED_WIDTH:
            return { ...base, binType, binWidth: 10 };
        case BinType.CUSTOM_RANGE:
            return { ...base, binType, customRange: [] };
        case BinType.CUSTOM_GROUP:
            return { ...base, binType, customGroups: [] };
    }
};

const renderNodeActions = (item: CustomBinDimension) => {
    const store = createExplorerStore();
    renderWithProviders(
        <Provider store={store}>
            <TreeSingleNodeActions
                item={item}
                isHovered
                isSelected={false}
                hasDescription={false}
                isOpened
                onMenuChange={vi.fn()}
                onViewDescription={vi.fn()}
            />
        </Provider>,
    );
    return store;
};

describe('custom bin write-back in Explorer trees', () => {
    it('opens write-back for supported bins from standard tree node actions', async () => {
        const user = userEvent.setup();
        const item = makeBin(BinType.FIXED_WIDTH);
        const store = renderNodeActions(item);

        await user.click(
            screen.getByRole('menuitem', { name: 'Write back to dbt' }),
        );

        expect(store.getState().explorer.modals.writeBack.items).toEqual([
            item,
        ]);
    });

    it('shows why fixed-number bins are unavailable in standard tree node actions', async () => {
        const user = userEvent.setup();
        renderNodeActions(makeBin(BinType.FIXED_NUMBER));
        const action = screen.getByRole('menuitem', {
            name: 'Write back to dbt',
        });

        expect(action).toBeDisabled();
        await user.hover(action.parentElement!);
        expect(
            await screen.findByText(
                /Fixed-number bins cannot be written back because they require a dbt model CTE/,
            ),
        ).toBeVisible();
    });

    it('includes supported bins in virtualized section write-back', async () => {
        const user = userEvent.setup();
        const item = makeBin(BinType.CUSTOM_RANGE);
        const store = createExplorerStore();
        store.dispatch(explorerActions.setCustomDimensions([item]));
        const sectionItem: SectionHeaderItem = {
            id: 'orders-custom-dimensions',
            type: 'section-header',
            estimatedHeight: ITEM_HEIGHTS.SECTION_HEADER,
            data: {
                tableName: 'orders',
                treeSection: TreeSection.CustomDimensions,
                label: 'Custom dimensions',
                color: 'blue.9',
            },
        };

        renderWithProviders(
            <Provider store={store}>
                <VirtualSectionHeader item={sectionItem} />
            </Provider>,
        );
        await user.click(
            screen.getByTestId(
                'VirtualSectionHeader/WriteBackCustomDimensionsButton',
            ),
        );

        expect(store.getState().explorer.modals.writeBack.items).toEqual([
            item,
        ]);
    });
});
