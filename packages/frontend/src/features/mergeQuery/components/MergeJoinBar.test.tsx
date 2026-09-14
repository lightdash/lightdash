import { MergeJoinType } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ChangeEvent } from 'react';
import { renderWithProviders } from '../../../testing/testUtils';
import { PRIMARY_SOURCE_ID } from '../constants';
import { MergeJoinBar } from './MergeJoinBar';
import { MergeReadOnlyBar } from './MergeReadOnlyBar';

type TestItem = {
    table: string;
    name: string;
    label: string;
};

const state = vi.hoisted(() => ({
    dispatch: vi.fn(),
    setJoinField: vi.fn(),
    addJoinPart: vi.fn(),
    removeJoinPart: vi.fn(),
    setJoinType: vi.fn(),
    toggleSourceField: vi.fn(),
    merge: {
        isMerging: true,
        readOnly: false,
        additionalSources: [
            {
                id: 'b',
                exploreName: 'customers',
                dimensions: [],
                metrics: [],
            },
        ],
        joinType: 'full',
        mergeResults: undefined,
        runErrors: [],
    },
    setup: {
        effectiveParts: [
            {
                fieldIdBySourceId: {
                    a: 'orders_customer_id',
                    b: 'customers_id',
                },
            },
        ] as Array<{
            fieldIdBySourceId: Record<string, string | null>;
        }>,
        labelFor: (fieldId: string) =>
            ({
                orders_customer_id: 'Customer ID',
                orders_account_id: 'Account ID',
                customers_id: 'ID',
                customers_account_key: 'Account key',
            })[fieldId] ?? fieldId,
        fanOut: [],
        joinKeyErrors: [],
        joinFieldLabel: 'join fields',
        primaryJoinItems: [] as TestItem[],
        additionalJoinItems: [] as TestItem[],
        availablePrimaryJoinItems: [] as TestItem[],
        availableAdditionalJoinItems: [] as TestItem[],
        suggestedAvailablePair: null as Record<string, string> | null,
        primaryExploreLabel: 'Orders',
        additionalExploreLabel: 'Customers',
        additionalSourceId: 'b',
        isIncomplete: false,
        blockingReason: null,
    },
}));

vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));

vi.mock('../../explorer/store', () => ({
    explorerActions: {
        toggleDimension: (fieldId: string) => ({
            type: 'toggleDimension',
            payload: fieldId,
        }),
    },
    selectTableName: vi.fn(),
    useExplorerDispatch: () => state.dispatch,
    useExplorerSelector: () => 'orders',
}));

vi.mock('../context/useMerge', () => ({
    useMergeSafe: () => ({
        ...state.merge,
        setJoinField: state.setJoinField,
        addJoinPart: state.addJoinPart,
        removeJoinPart: state.removeJoinPart,
        setJoinType: state.setJoinType,
        toggleSourceField: state.toggleSourceField,
    }),
}));

vi.mock('../hooks/useMergeSetup', () => ({
    useMergeSetup: () => state.setup,
}));

vi.mock('../../../components/common/FieldSelect', () => ({
    default: ({
        'aria-label': ariaLabel,
        item,
        items,
        onChange,
    }: {
        'aria-label': string;
        item?: TestItem;
        items: TestItem[];
        onChange: (item: TestItem | undefined) => void;
    }) => {
        const itemId = (candidate: TestItem) =>
            `${candidate.table}_${candidate.name}`;
        return (
            <select
                aria-label={ariaLabel}
                value={item ? itemId(item) : ''}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    onChange(
                        items.find(
                            (candidate) =>
                                itemId(candidate) === event.target.value,
                        ),
                    )
                }
            >
                <option value="">Choose a field</option>
                {items.map((candidate) => (
                    <option key={itemId(candidate)} value={itemId(candidate)}>
                        {candidate.label}
                    </option>
                ))}
            </select>
        );
    },
}));

const primaryItems: TestItem[] = [
    { table: 'orders', name: 'customer_id', label: 'Customer ID' },
    { table: 'orders', name: 'account_id', label: 'Account ID' },
];
const additionalItems: TestItem[] = [
    { table: 'customers', name: 'id', label: 'ID' },
    { table: 'customers', name: 'account_key', label: 'Account key' },
];

const resetState = () => {
    state.merge.readOnly = false;
    state.merge.joinType = MergeJoinType.FULL;
    state.setup.effectiveParts = [
        {
            fieldIdBySourceId: {
                [PRIMARY_SOURCE_ID]: 'orders_customer_id',
                b: 'customers_id',
            },
        },
    ];
    state.setup.primaryJoinItems = [primaryItems[0]];
    state.setup.additionalJoinItems = [additionalItems[0]];
    state.setup.availablePrimaryJoinItems = primaryItems;
    state.setup.availableAdditionalJoinItems = additionalItems;
    state.setup.suggestedAvailablePair = null;
    state.setup.isIncomplete = false;
};

describe('MergeJoinBar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetState();
    });

    it('shows source-qualified fields and updates the correct side', async () => {
        const user = userEvent.setup();
        renderWithProviders(<MergeJoinBar guided />);

        expect(screen.getByText('Orders')).toBeInTheDocument();
        expect(screen.getByText('Customers')).toBeInTheDocument();
        expect(screen.getByText('=')).toBeInTheDocument();

        await user.selectOptions(
            screen.getByRole('combobox', { name: 'Orders join field' }),
            'orders_account_id',
        );
        await user.selectOptions(
            screen.getByRole('combobox', { name: 'Customers join field' }),
            'customers_account_key',
        );

        expect(state.setJoinField).toHaveBeenCalledWith(
            0,
            PRIMARY_SOURCE_ID,
            'orders_account_id',
        );
        expect(state.setJoinField).toHaveBeenCalledWith(
            0,
            'b',
            'customers_account_key',
        );
    });

    it('shows AND between clauses and keeps remove actions visible', async () => {
        const user = userEvent.setup();
        state.setup.effectiveParts = [
            ...state.setup.effectiveParts,
            {
                fieldIdBySourceId: {
                    [PRIMARY_SOURCE_ID]: 'orders_account_id',
                    b: 'customers_account_key',
                },
            },
        ];

        renderWithProviders(<MergeJoinBar guided />);

        expect(screen.getByText('AND')).toBeInTheDocument();
        await user.click(
            screen.getByRole('button', {
                name: 'Remove join condition 2',
            }),
        );
        expect(state.removeJoinPart).toHaveBeenCalledWith(1);
    });

    it('applies a source-qualified suggested pair', async () => {
        const user = userEvent.setup();
        state.setup.effectiveParts = [
            {
                fieldIdBySourceId: {
                    [PRIMARY_SOURCE_ID]: null,
                    b: null,
                },
            },
        ];
        state.setup.isIncomplete = true;
        state.setup.suggestedAvailablePair = {
            [PRIMARY_SOURCE_ID]: 'orders_customer_id',
            b: 'customers_id',
        };

        renderWithProviders(<MergeJoinBar guided />);

        expect(
            screen.getByText('Orders · Customer ID = Customers · ID', {
                exact: false,
            }),
        ).toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Use suggestion' }),
        );

        expect(state.setJoinField).toHaveBeenCalledWith(
            0,
            PRIMARY_SOURCE_ID,
            'orders_customer_id',
        );
        expect(state.setJoinField).toHaveBeenCalledWith(0, 'b', 'customers_id');
    });

    it('supports clicking and arrow-key navigation between join types', async () => {
        const user = userEvent.setup();
        renderWithProviders(<MergeJoinBar guided />);

        const fullOuter = screen.getByRole('radio', {
            name: /Full outer:/,
        });
        expect(fullOuter).toBeChecked();

        await user.click(screen.getByRole('radio', { name: /Left:/ }));
        expect(state.setJoinType).toHaveBeenCalledWith(MergeJoinType.LEFT);

        fullOuter.focus();
        await user.keyboard('{ArrowRight}');
        expect(state.setJoinType).toHaveBeenCalledWith(MergeJoinType.INNER);
    });

    it('keeps both source and field names in the collapsed summary', () => {
        renderWithProviders(<MergeJoinBar />);

        expect(
            screen.getByText('Orders · Customer ID = Customers · ID', {
                exact: false,
            }),
        ).toBeInTheDocument();
    });
});

describe('MergeReadOnlyBar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetState();
        state.merge.readOnly = true;
    });

    it('shows both source-qualified fields', () => {
        renderWithProviders(<MergeReadOnlyBar />);

        expect(
            screen.getByText('Orders · Customer ID = Customers · ID', {
                exact: false,
            }),
        ).toBeInTheDocument();
    });
});
