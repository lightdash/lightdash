import { describe, expect, it } from 'vitest';
import {
    getApplyBlock,
    getAvailableControlTypes,
    getDismissAction,
    getGuardDecision,
    getShouldRestartNewControl,
} from './guard';

describe('getGuardDecision', () => {
    it('does nothing with no control open', () => {
        expect(
            getGuardDecision({ hasOpenControl: false, hasChanges: false }),
        ).toBe('none');
    });

    it('lets an open control with no changes give way', () => {
        expect(
            getGuardDecision({ hasOpenControl: true, hasChanges: false }),
        ).toBe('replace');
    });

    it('holds an open control that has changes', () => {
        expect(
            getGuardDecision({ hasOpenControl: true, hasChanges: true }),
        ).toBe('hold');
    });
});

describe('getDismissAction', () => {
    it('cancels a new control nobody answered or changed', () => {
        expect(getDismissAction({ isChoosing: true, hasChanges: false })).toBe(
            'cancel',
        );
    });

    it('shrinks a control past its first step, changed or not', () => {
        expect(getDismissAction({ isChoosing: false, hasChanges: false })).toBe(
            'shrink',
        );
        expect(getDismissAction({ isChoosing: false, hasChanges: true })).toBe(
            'shrink',
        );
    });

    it('shrinks a new control changed from its tiles before it was answered', () => {
        expect(getDismissAction({ isChoosing: true, hasChanges: true })).toBe(
            'shrink',
        );
    });
});

describe('getApplyBlock', () => {
    const ready = {
        isLoading: false,
        isMapped: true,
        mappedCount: 3,
        hasValue: true,
    };

    it('lets a control that applies to tiles be applied', () => {
        expect(getApplyBlock(ready)).toBeNull();
    });

    it('blocks a control that applies to no tiles, with or without a field', () => {
        expect(getApplyBlock({ ...ready, mappedCount: 0 })).toBe('noTiles');
        expect(
            getApplyBlock({ ...ready, isMapped: false, mappedCount: 0 }),
        ).toBe('noTiles');
    });

    it('blocks a control with tiles switched on but no field', () => {
        expect(getApplyBlock({ ...ready, isMapped: false })).toBe('noTiles');
    });

    it('asks for tiles before it asks for a value', () => {
        expect(
            getApplyBlock({ ...ready, mappedCount: 0, hasValue: false }),
        ).toBe('noTiles');
        expect(getApplyBlock({ ...ready, hasValue: false })).toBe('noValue');
    });

    it('waits while tiles are loading', () => {
        expect(getApplyBlock({ ...ready, isLoading: true })).toBe('loading');
    });
});

describe('getAvailableControlTypes', () => {
    it('offers a type the dashboard has a field or a parameter of', () => {
        const types = getAvailableControlTypes({
            fieldTypes: ['text', 'text'],
            parameterTypes: ['date'],
        });
        expect(types && [...types].sort()).toEqual(['date', 'text']);
    });

    it('offers fields only where no parameters are passed', () => {
        const types = getAvailableControlTypes({
            fieldTypes: ['number'],
            parameterTypes: [],
        });
        expect(types && [...types]).toEqual(['number']);
    });

    it('tells date fields from time fields, and gives date parameters to date only', () => {
        const onlyTime = getAvailableControlTypes({
            fieldTypes: ['time'],
            parameterTypes: [],
        });
        expect(onlyTime && [...onlyTime]).toEqual(['time']);
        const dateParameter = getAvailableControlTypes({
            fieldTypes: [],
            parameterTypes: ['date'],
        });
        expect(dateParameter && [...dateParameter]).toEqual(['date']);
    });

    it('keeps every type on offer while fields or parameters are unknown', () => {
        expect(
            getAvailableControlTypes({
                fieldTypes: null,
                parameterTypes: ['string'],
            }),
        ).toBeNull();
        expect(
            getAvailableControlTypes({
                fieldTypes: ['text'],
                parameterTypes: null,
            }),
        ).toBeNull();
    });
});

describe('getShouldRestartNewControl', () => {
    const answered = {
        isNew: true,
        isAnswered: true,
        isLoading: false,
        isMapped: true,
        mappedCount: 2,
    };

    it('keeps a new control that applies to tiles on its tabs', () => {
        expect(getShouldRestartNewControl(answered)).toBe(false);
    });

    it('goes back to the question when its last field or parameter is removed', () => {
        expect(
            getShouldRestartNewControl({
                ...answered,
                isMapped: false,
                mappedCount: 0,
            }),
        ).toBe(true);
    });

    it('goes back when the last tile is cleared and the parameter stays at 0 tiles', () => {
        expect(
            getShouldRestartNewControl({ ...answered, mappedCount: 0 }),
        ).toBe(true);
    });

    it('goes back when only switched-on tiles are left and no field', () => {
        expect(
            getShouldRestartNewControl({ ...answered, isMapped: false }),
        ).toBe(true);
    });

    it('leaves an existing control on its tabs', () => {
        expect(
            getShouldRestartNewControl({
                ...answered,
                isNew: false,
                isMapped: false,
                mappedCount: 0,
            }),
        ).toBe(false);
    });

    it('does nothing before the question is answered', () => {
        expect(
            getShouldRestartNewControl({
                ...answered,
                isAnswered: false,
                isMapped: false,
                mappedCount: 0,
            }),
        ).toBe(false);
    });

    it('waits while tiles are loading', () => {
        expect(
            getShouldRestartNewControl({
                ...answered,
                isLoading: true,
                mappedCount: 0,
            }),
        ).toBe(false);
    });
});
