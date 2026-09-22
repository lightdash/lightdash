import { MAX_MERGE_TABLE_CALCULATION_FORMULA_LENGTH } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../testing/testUtils';
import {
    DeleteMergeTableCalculationModal,
    MergeTableCalculationModal,
} from './MergeTableCalculationModal';

const state = vi.hoisted(() => ({
    addTableCalculation: vi.fn(),
    updateTableCalculation: vi.fn(),
    removeTableCalculation: vi.fn(),
    dispatch: vi.fn(),
    sorts: [] as { fieldId: string; descending: boolean }[],
    tableCalculations: [] as {
        name: string;
        displayName: string;
        sql: string;
        formula: string;
    }[],
}));

vi.mock('../context/useMerge', () => ({
    useMerge: () => ({
        mergeResults: undefined,
        tableCalculations: state.tableCalculations,
        addTableCalculation: state.addTableCalculation,
        updateTableCalculation: state.updateTableCalculation,
        removeTableCalculation: state.removeTableCalculation,
    }),
}));

vi.mock('../../explorer/store', () => ({
    explorerActions: {
        setSortFields: (sorts: typeof state.sorts) => ({
            type: 'explorer/setSortFields',
            payload: sorts,
        }),
    },
    selectSorts: vi.fn(),
    useExplorerDispatch: () => state.dispatch,
    useExplorerSelector: () => state.sorts,
}));

vi.mock('../../tableCalculation/components/FormulaForm/FormulaEditor', () => ({
    FormulaEditor: ({
        initialContent,
        onTextChange,
    }: {
        initialContent: string;
        onTextChange: (value: string) => void;
    }) => (
        <input
            aria-label="Formula"
            defaultValue={initialContent}
            onChange={(event) => onTextChange(event.currentTarget.value)}
        />
    ),
}));

describe('MergeTableCalculationModal', () => {
    beforeEach(() => {
        state.addTableCalculation.mockReset();
        state.updateTableCalculation.mockReset();
        state.removeTableCalculation.mockReset();
        state.dispatch.mockReset();
        state.sorts = [];
        state.tableCalculations = [];
    });

    it('creates a formula over the merged result', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderWithProviders(
            <MergeTableCalculationModal opened onClose={onClose} />,
        );

        await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Rate');
        const formula = screen.getByRole('textbox', { name: 'Formula' });
        await user.clear(formula);
        await user.type(formula, '=1 + 1');
        await user.click(
            screen.getByRole('button', { name: 'Create formula' }),
        );

        expect(state.addTableCalculation).toHaveBeenCalledWith({
            name: 'rate',
            displayName: 'Rate',
            sql: '',
            formula: '=1 + 1',
        });
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('refuses an oversized formula before parsing it', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <MergeTableCalculationModal opened onClose={vi.fn()} />,
        );

        await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Rate');
        fireEvent.change(screen.getByRole('textbox', { name: 'Formula' }), {
            target: {
                value: `=${'1'.repeat(
                    MAX_MERGE_TABLE_CALCULATION_FORMULA_LENGTH,
                )}`,
            },
        });
        await user.click(
            screen.getByRole('button', { name: 'Create formula' }),
        );

        expect(state.addTableCalculation).not.toHaveBeenCalled();
        expect(
            screen.getByText(
                `Formula must be ${MAX_MERGE_TABLE_CALCULATION_FORMULA_LENGTH.toLocaleString()} characters or fewer`,
            ),
        ).toBeInTheDocument();
    });

    it('renames its active sort when edited', async () => {
        const user = userEvent.setup();
        const tableCalculation = {
            name: 'ratio',
            displayName: 'Ratio',
            sql: '',
            formula: '=1',
        };
        state.tableCalculations = [tableCalculation];
        state.sorts = [
            { fieldId: 'merge_ratio', descending: true },
            { fieldId: 'orders_count', descending: false },
        ];
        renderWithProviders(
            <MergeTableCalculationModal
                opened
                onClose={vi.fn()}
                tableCalculation={tableCalculation}
            />,
        );

        const name = screen.getByRole('textbox', { name: 'Name' });
        await user.clear(name);
        await user.type(name, 'Conversion rate');
        await user.click(screen.getByRole('button', { name: 'Save changes' }));

        expect(state.updateTableCalculation).toHaveBeenCalledWith('ratio', {
            ...tableCalculation,
            name: 'conversion_rate',
            displayName: 'Conversion rate',
        });
        expect(state.dispatch).toHaveBeenCalledWith({
            type: 'explorer/setSortFields',
            payload: [
                { fieldId: 'merge_conversion_rate', descending: true },
                { fieldId: 'orders_count', descending: false },
            ],
        });
    });

    it('removes its active sort when deleted', async () => {
        const user = userEvent.setup();
        const tableCalculation = {
            name: 'ratio',
            displayName: 'Ratio',
            sql: '',
            formula: '=1',
        };
        state.sorts = [
            { fieldId: 'merge_ratio', descending: true },
            { fieldId: 'orders_count', descending: false },
        ];
        const onClose = vi.fn();
        renderWithProviders(
            <DeleteMergeTableCalculationModal
                tableCalculation={tableCalculation}
                onClose={onClose}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Delete' }));

        expect(state.removeTableCalculation).toHaveBeenCalledWith('ratio');
        expect(state.dispatch).toHaveBeenCalledWith({
            type: 'explorer/setSortFields',
            payload: [{ fieldId: 'orders_count', descending: false }],
        });
        expect(onClose).toHaveBeenCalledOnce();
    });
});
