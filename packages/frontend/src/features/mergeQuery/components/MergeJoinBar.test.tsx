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
    setRepeatValues: vi.fn(),
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
        repeatValuesSourceIds: [] as string[],
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
        fanOut: [] as Array<{ sourceId: string; fields: string[] }>,
        joinKeyErrors: [],
        joinFieldLabel: 'join fields',
        primaryJoinItems: [] as TestItem[],
        additionalJoinItems: [] as TestItem[],
        availablePrimaryJoinItems: [] as TestItem[],
        availableAdditionalJoinItems: [] as TestItem[],
        suggestedAvailablePair: null as Record<string, string> | null,
        getJoinCandidates: (
            _side: 'primary' | 'additional',
            _counterpartFieldId: string | null,
        ): { suggested: TestItem[]; incompatible: TestItem[] } => ({
            suggested: [],
            incompatible: [],
        }),
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
        setRepeatValues: state.setRepeatValues,
        toggleSourceField: state.toggleSourceField,
    }),
}));

vi.mock('../hooks/useMergeSetup', () => ({
    useMergeSetup: () => ({
        ...state.setup,
        additionalSource: state.merge.additionalSources[0],
        first: {
            availablePrimaryJoinItems: state.setup.availablePrimaryJoinItems,
        },
        sourceSetups: state.merge.additionalSources.map((source) => ({
            additionalSourceId: source.id,
            additionalSource: source,
            additionalExploreLabel:
                source.id === 'b' || source.exploreName === 'customers'
                    ? state.setup.additionalExploreLabel
                    : 'Payments',
            availableAdditionalJoinItems:
                state.setup.availableAdditionalJoinItems,
            getJoinCandidates: state.setup.getJoinCandidates,
        })),
        sourceLabels: [
            state.setup.primaryExploreLabel,
            state.setup.additionalExploreLabel,
        ],
        relationshipSummary: state.setup.effectiveParts
            .map(
                (part) =>
                    `${state.setup.primaryExploreLabel} · ${state.setup.labelFor(part.fieldIdBySourceId.a!)} = ${state.setup.additionalExploreLabel} · ${state.setup.labelFor(part.fieldIdBySourceId.b!)}`,
            )
            .join(' AND '),
    }),
}));

vi.mock('../../../components/common/FieldSelect', () => ({
    default: ({
        'aria-label': ariaLabel,
        item,
        items,
        suggestedItems = [],
        inactiveItemIds = [],
        onChange,
    }: {
        'aria-label': string;
        item?: TestItem;
        items: TestItem[];
        suggestedItems?: TestItem[];
        inactiveItemIds?: string[];
        onChange: (item: TestItem | undefined) => void;
    }) => {
        const itemId = (candidate: TestItem) =>
            `${candidate.table}_${candidate.name}`;
        const suggestedIds = suggestedItems.map(itemId);
        const ordered = [
            ...suggestedItems,
            ...items.filter(
                (candidate) => !suggestedIds.includes(itemId(candidate)),
            ),
        ];
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
                {ordered.map((candidate) => (
                    <option
                        key={itemId(candidate)}
                        value={itemId(candidate)}
                        disabled={inactiveItemIds.includes(itemId(candidate))}
                    >
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
    state.merge.additionalSources = [
        {
            id: 'b',
            exploreName: 'customers',
            dimensions: [],
            metrics: [],
        },
    ];
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
    state.setup.fanOut = [];
    state.merge.repeatValuesSourceIds = [];
    state.setup.suggestedAvailablePair = null;
    state.setup.getJoinCandidates = () => ({
        suggested: [],
        incompatible: [],
    });
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

        expect(screen.getByText('Orders (first source)')).toBeInTheDocument();
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

    it('says when a source contributes no values to a complete result', () => {
        state.merge.mergeResults = {
            results: {
                rows: [
                    {
                        merge_join_key_0: {
                            value: { raw: 'c1', formatted: 'c1' },
                        },
                        a_orders_total: { value: { raw: 10, formatted: '10' } },
                        b_customers_count: {
                            value: { raw: null, formatted: '' },
                        },
                    },
                ],
                hasFetchedAllRows: true,
                error: null,
            },
            fieldOrigins: {
                merge_join_key_0: {
                    kind: 'joinKey',
                    fieldIdBySourceId: {
                        a: 'orders_customer_id',
                        b: 'customers_id',
                    },
                },
                a_orders_total: {
                    kind: 'source',
                    sourceId: 'a',
                    sourceFieldId: 'orders_total',
                },
                b_customers_count: {
                    kind: 'source',
                    sourceId: 'b',
                    sourceFieldId: 'customers_count',
                },
            },
        } as never;
        renderWithProviders(<MergeJoinBar />);
        expect(
            screen.getByText(
                "Customers's columns are blank on every row: its query returned no rows matching Orders on join fields.",
            ),
        ).toBeInTheDocument();
        state.merge.mergeResults = undefined;
    });

    it("lists the other side's recommended fields first and rules out the rest", () => {
        state.setup.getJoinCandidates = (side) =>
            side === 'additional'
                ? {
                      suggested: [additionalItems[1]],
                      incompatible: [additionalItems[0]],
                  }
                : { suggested: [], incompatible: [] };

        renderWithProviders(<MergeJoinBar guided />);

        const options = Array.from(
            screen
                .getByRole('combobox', { name: 'Customers join field' })
                .querySelectorAll('option'),
        ).slice(1);
        expect(options.map((option) => option.textContent)).toEqual([
            'Account key',
            'ID',
        ]);
        expect(options.map((option) => option.disabled)).toEqual([false, true]);
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

    it('shows every source mapping together and updates the selected source', async () => {
        const user = userEvent.setup();
        state.merge.additionalSources = [
            ...state.merge.additionalSources,
            {
                id: 'c',
                exploreName: 'payments',
                dimensions: [],
                metrics: [],
            },
        ];
        state.setup.effectiveParts = [
            {
                fieldIdBySourceId: {
                    [PRIMARY_SOURCE_ID]: 'orders_customer_id',
                    b: 'customers_id',
                    c: 'customers_account_key',
                },
            },
        ];

        renderWithProviders(<MergeJoinBar guided />);

        expect(
            screen.getByRole('combobox', { name: 'Customers join field' }),
        ).toBeInTheDocument();
        await user.selectOptions(
            screen.getByRole('combobox', { name: 'Payments join field' }),
            'customers_id',
        );

        expect(state.setJoinField).toHaveBeenCalledWith(0, 'c', 'customers_id');
        state.merge.additionalSources = state.merge.additionalSources.slice(
            0,
            1,
        );
    });

    it('disambiguates repeated explores in the shared key mapping', () => {
        state.merge.additionalSources = [
            ...state.merge.additionalSources,
            {
                id: 'c',
                exploreName: 'customers',
                dimensions: [],
                metrics: [],
            },
        ];
        state.setup.effectiveParts[0].fieldIdBySourceId.c = 'customers_id';

        renderWithProviders(<MergeJoinBar guided />);

        expect(screen.getAllByText(/^Customers · /)).toHaveLength(2);
    });

    it('supports clicking and arrow-key navigation between join types', async () => {
        const user = userEvent.setup();
        renderWithProviders(<MergeJoinBar guided />);

        const fullOuter = screen.getByRole('radio', {
            name: /All rows:/,
        });
        expect(fullOuter).toBeChecked();

        await user.click(screen.getByRole('radio', { name: /From Orders:/ }));
        expect(state.setJoinType).toHaveBeenCalledWith(MergeJoinType.LEFT);

        fullOuter.focus();
        await user.keyboard('{ArrowRight}');
        expect(state.setJoinType).toHaveBeenCalledWith(MergeJoinType.INNER);
    });

    it("offers to repeat the other query's values when one side is split", async () => {
        const user = userEvent.setup();
        state.setup.fanOut = [
            { sourceId: PRIMARY_SOURCE_ID, fields: ['orders_account_id'] },
        ];

        renderWithProviders(<MergeJoinBar guided />);

        expect(
            screen.getByText(/Orders is split by Account ID/),
        ).toBeInTheDocument();
        await user.click(
            screen.getByRole('button', {
                name: /repeat Customers's values on every Orders row/,
            }),
        );
        expect(state.setRepeatValues).toHaveBeenCalledWith('b', true);
    });

    it('says which query repeats and lets the user stop it', async () => {
        const user = userEvent.setup();
        state.merge.repeatValuesSourceIds = ['b'];

        renderWithProviders(<MergeJoinBar guided />);

        expect(
            screen.getByText(/Customers's values repeat on every Orders row/),
        ).toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Stop repeating' }),
        );
        expect(state.setRepeatValues).toHaveBeenCalledWith('b', false);
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
