import { FilterOperator, type DashboardFilterRule } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import FilterRequirementsButton from './FilterRequirementsButton';

const requiredRule: DashboardFilterRule = {
    id: 'filter-1',
    target: {
        fieldId: 'customers_first_name',
        tableName: 'customers',
    },
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: true,
    required: true,
    label: undefined,
};

const eligibleRule: DashboardFilterRule = {
    id: 'filter-2',
    target: {
        fieldId: 'customers_age',
        tableName: 'customers',
    },
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: true,
    label: undefined,
};

const setRequiredFiltersNote = vi.fn();
const closeRulesPopover = vi.fn();
const updateFilterRule = vi.hoisted(() => vi.fn());

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));

vi.mock('./useFilterableItemsMap', () => ({
    useFilterableItemsMap: vi.fn(() => ({})),
}));

vi.mock('./useUpdateDashboardFilterRule', () => ({
    useUpdateDashboardFilterRule: vi.fn(() => updateFilterRule),
}));

vi.mock('./useFilterBarPopovers', () => ({
    useFilterBarPopovers: vi.fn(() => ({
        isRulesPopoverOpen: true,
        openRulesPopover: vi.fn(),
        closeRulesPopover,
    })),
}));

const getNoteTextarea = () =>
    screen.getByLabelText<HTMLTextAreaElement>('Note for viewers');
// jsdom never positions the floating dropdown (inline display:none), so its
// contents are outside the a11y tree; include hidden elements when querying
const getSaveButton = () =>
    screen.getByRole<HTMLButtonElement>('button', {
        name: 'Save',
        hidden: true,
    });
const queryRemoveChipButton = () =>
    screen.queryByRole('button', {
        name: 'Remove customers_first_name',
        hidden: true,
    });
const openFilterSelect = async (placeholder: string) => {
    await userEvent.click(screen.getByPlaceholderText(placeholder));
};
// jsdom keeps the combobox dropdown display:none, so bypass the
// pointer-events check with fireEvent
const clickFilterOption = (label: string) => {
    fireEvent.click(
        screen.getByRole('option', { name: new RegExp(label), hidden: true }),
    );
};

describe('FilterRequirementsButton explicit save', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDashboardContext.current = {
            isFilterRequirementsEnabled: true,
            dashboardFilters: {
                dimensions: [requiredRule],
                metrics: [],
                tableCalculations: [],
            },
            requiredFiltersNote: 'Saved note',
            setRequiredFiltersNote,
        };
    });

    it('disables Save until something is edited', async () => {
        renderWithProviders(<FilterRequirementsButton />);

        expect(getSaveButton().disabled).toBe(true);

        await userEvent.type(getNoteTextarea(), '!');
        expect(getSaveButton().disabled).toBe(false);
    });

    it('keeps note edits local and commits them on Save', async () => {
        renderWithProviders(<FilterRequirementsButton />);

        const textarea = getNoteTextarea();
        await userEvent.type(textarea, '!');
        expect(textarea.value).toBe('Saved note!');

        await userEvent.tab();
        expect(setRequiredFiltersNote).not.toHaveBeenCalled();

        await userEvent.click(getSaveButton());
        expect(setRequiredFiltersNote).toHaveBeenCalledTimes(1);
        expect(setRequiredFiltersNote).toHaveBeenCalledWith('Saved note!');
        expect(closeRulesPopover).toHaveBeenCalled();
    });

    it('allows clearing a saved note', async () => {
        renderWithProviders(<FilterRequirementsButton />);

        const textarea = getNoteTextarea();
        await userEvent.clear(textarea);
        expect(textarea.value).toBe('');

        await userEvent.click(getSaveButton());
        expect(setRequiredFiltersNote).toHaveBeenCalledWith('');
    });

    it('stages member removal and applies it on Save', async () => {
        renderWithProviders(<FilterRequirementsButton />);

        const removeButton = queryRemoveChipButton();
        expect(removeButton).not.toBeNull();
        await userEvent.click(removeButton!);

        // Last member of the rule: removal asks for confirmation first
        await userEvent.click(
            await screen.findByRole('button', {
                name: 'Remove rule',
                hidden: true,
            }),
        );

        // Staged: the chip is gone from the draft view, nothing committed yet
        expect(queryRemoveChipButton()).toBeNull();
        expect(updateFilterRule).not.toHaveBeenCalled();

        await userEvent.click(getSaveButton());
        expect(updateFilterRule).toHaveBeenCalledWith('filter-1', {
            required: false,
            requiredGroupId: undefined,
        });
    });

    it('keeps the member when last-member removal is cancelled', async () => {
        renderWithProviders(<FilterRequirementsButton />);

        await userEvent.click(queryRemoveChipButton()!);
        await userEvent.click(
            await screen.findByRole('button', {
                name: 'Cancel',
                hidden: true,
            }),
        );

        expect(queryRemoveChipButton()).not.toBeNull();
        expect(updateFilterRule).not.toHaveBeenCalled();
    });

    it('saves via keyboard activation of the Save button', async () => {
        renderWithProviders(<FilterRequirementsButton />);

        await userEvent.type(getNoteTextarea(), '!');

        getSaveButton().focus();
        await userEvent.keyboard('{Enter}');

        expect(setRequiredFiltersNote).toHaveBeenCalledWith('Saved note!');
        expect(closeRulesPopover).toHaveBeenCalled();
    });

    it('converts a required singleton to a shared group when adding a member', async () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardFilters: {
                dimensions: [requiredRule, eligibleRule],
                metrics: [],
                tableCalculations: [],
            },
        };
        renderWithProviders(<FilterRequirementsButton />);

        await openFilterSelect('+ or another filter');
        clickFilterOption('customers_age');

        // Staged: both chips render as one rule, nothing committed yet
        expect(
            screen.getByText('Viewers must set at least one of:'),
        ).not.toBeNull();
        expect(queryRemoveChipButton()).not.toBeNull();
        expect(updateFilterRule).not.toHaveBeenCalled();

        await userEvent.click(getSaveButton());
        expect(updateFilterRule).toHaveBeenCalledTimes(2);
        const [existingMemberCall, newMemberCall] = updateFilterRule.mock.calls;
        expect(existingMemberCall[0]).toBe('filter-1');
        expect(existingMemberCall[1]).toMatchObject({
            required: false,
            disabled: true,
            values: [],
        });
        expect(newMemberCall[0]).toBe('filter-2');
        expect(newMemberCall[1]).toMatchObject({
            required: false,
            disabled: true,
            values: [],
        });
        // Both members join the same freshly minted group
        expect(typeof existingMemberCall[1].requiredGroupId).toBe('string');
        expect(newMemberCall[1].requiredGroupId).toBe(
            existingMemberCall[1].requiredGroupId,
        );
    });

    it('stages rule deletion for every member and applies it on Save', async () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardFilters: {
                dimensions: [
                    { ...requiredRule, required: false, requiredGroupId: 'g1' },
                    { ...eligibleRule, requiredGroupId: 'g1' },
                ],
                metrics: [],
                tableCalculations: [],
            },
        };
        renderWithProviders(<FilterRequirementsButton />);

        await userEvent.click(
            screen.getByRole('button', { name: 'Delete rule', hidden: true }),
        );

        expect(queryRemoveChipButton()).toBeNull();
        expect(updateFilterRule).not.toHaveBeenCalled();

        await userEvent.click(getSaveButton());
        expect(updateFilterRule).toHaveBeenCalledWith('filter-1', {
            required: false,
            requiredGroupId: undefined,
        });
        expect(updateFilterRule).toHaveBeenCalledWith('filter-2', {
            required: false,
            requiredGroupId: undefined,
        });
    });

    it('creates a rule from a draft row and applies it on Save', async () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardFilters: {
                dimensions: [eligibleRule],
                metrics: [],
                tableCalculations: [],
            },
        };
        renderWithProviders(<FilterRequirementsButton />);

        await userEvent.click(
            screen.getByRole('button', { name: 'Add rule', hidden: true }),
        );
        await openFilterSelect('+ Add filter');
        clickFilterOption('customers_age');

        expect(updateFilterRule).not.toHaveBeenCalled();

        await userEvent.click(getSaveButton());
        expect(updateFilterRule).toHaveBeenCalledTimes(1);
        const [[filterId, updates]] = updateFilterRule.mock.calls;
        expect(filterId).toBe('filter-2');
        expect(updates).toMatchObject({
            required: false,
            disabled: true,
            values: [],
        });
        expect(typeof updates.requiredGroupId).toBe('string');
    });

    it('discards staged edits when the popover closes without saving', async () => {
        renderWithProviders(<FilterRequirementsButton />);

        await userEvent.type(getNoteTextarea(), '!');
        await userEvent.click(queryRemoveChipButton()!);

        // The target button toggles the open popover closed
        await userEvent.click(
            screen.getByRole('button', { name: /Filter rules/ }),
        );

        expect(closeRulesPopover).toHaveBeenCalled();
        expect(setRequiredFiltersNote).not.toHaveBeenCalled();
        expect(updateFilterRule).not.toHaveBeenCalled();

        // Drafts reset: saved state is displayed again
        expect(getNoteTextarea().value).toBe('Saved note');
        expect(queryRemoveChipButton()).not.toBeNull();
    });
});
