import { describe, expect, it } from 'vitest';
import { getDraftsTemporaryFilters, opensAsControl } from './surface';

const VIEW = {
    isEnabled: true,
    isEditMode: false,
    isEmbedded: false,
    isCompact: false,
    hasOpenControl: false,
};

describe('getDraftsTemporaryFilters', () => {
    it('is on in view mode with the flag on', () => {
        expect(getDraftsTemporaryFilters(VIEW)).toBe(true);
    });

    it.each([
        ['the flag is off', { ...VIEW, isEnabled: false }],
        ['the dashboard is being edited', { ...VIEW, isEditMode: true }],
        ['the dashboard is embedded', { ...VIEW, isEmbedded: true }],
        ['the bar is compact', { ...VIEW, isCompact: true }],
    ])('is off when %s', (_name, input) => {
        expect(getDraftsTemporaryFilters(input)).toBe(false);
    });

    it('stays on in a compact bar while a control is open', () => {
        expect(
            getDraftsTemporaryFilters({
                ...VIEW,
                isCompact: true,
                hasOpenControl: true,
            }),
        ).toBe(true);
    });

    it.each([
        ['the flag is off', { isEnabled: false }],
        ['the dashboard is being edited', { isEditMode: true }],
        ['the dashboard is embedded', { isEmbedded: true }],
    ])('an open control does not turn it on when %s', (_name, change) => {
        expect(
            getDraftsTemporaryFilters({
                ...VIEW,
                hasOpenControl: true,
                ...change,
            }),
        ).toBe(false);
    });

    it('is off with the flag off whatever else holds', () => {
        [true, false].forEach((isEditMode) =>
            [true, false].forEach((isEmbedded) =>
                [true, false].forEach((isCompact) =>
                    expect(
                        getDraftsTemporaryFilters({
                            isEnabled: false,
                            isEditMode,
                            isEmbedded,
                            isCompact,
                            hasOpenControl: true,
                        }),
                    ).toBe(false),
                ),
            ),
        );
    });
});

describe('opensAsControl', () => {
    it('never opens a control with the flag off', () => {
        [true, false].forEach((isEditMode) =>
            [true, false].forEach((isTemporary) =>
                expect(
                    opensAsControl({
                        isEnabled: false,
                        draftsTemporaryFilters: false,
                        isEditMode,
                        isTemporary,
                    }),
                ).toBe(false),
            ),
        );
    });

    it('opens saved filters as controls while editing, temporary ones as today', () => {
        const editing = {
            isEnabled: true,
            draftsTemporaryFilters: false,
            isEditMode: true,
        };
        expect(opensAsControl({ ...editing, isTemporary: false })).toBe(true);
        expect(opensAsControl({ ...editing, isTemporary: true })).toBe(false);
    });

    it('opens temporary filters as controls while viewing, saved ones as today', () => {
        const viewing = {
            isEnabled: true,
            draftsTemporaryFilters: true,
            isEditMode: false,
        };
        expect(opensAsControl({ ...viewing, isTemporary: true })).toBe(true);
        expect(opensAsControl({ ...viewing, isTemporary: false })).toBe(false);
    });

    it('keeps every pill as today while viewing where drafts are off', () => {
        const viewing = {
            isEnabled: true,
            draftsTemporaryFilters: false,
            isEditMode: false,
        };
        expect(opensAsControl({ ...viewing, isTemporary: true })).toBe(false);
        expect(opensAsControl({ ...viewing, isTemporary: false })).toBe(false);
    });
});
