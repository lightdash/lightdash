import { describe, expect, it } from 'vitest';
import { SCOPE_TOURS } from './generated';
import { lessonScopesFor, stepsForLeftNavigation, tourFor } from './tourFor';

describe('tourFor', () => {
    it('answers a generated tour by its scope name', () => {
        const [scope] = Object.keys(SCOPE_TOURS);
        expect(tourFor(scope)).toBe(SCOPE_TOURS[scope]);
    });
    it('answers nothing for names that only exist on Object.prototype', () => {
        expect(tourFor('constructor')).toBeUndefined();
        expect(tourFor('toString')).toBeUndefined();
        expect(tourFor('hasOwnProperty')).toBeUndefined();
        expect(tourFor('__proto__')).toBeUndefined();
    });
    it('answers nothing for an empty or missing name', () => {
        expect(tourFor('')).toBeUndefined();
        expect(tourFor(null)).toBeUndefined();
        expect(tourFor(undefined)).toBeUndefined();
    });
});

describe('lessonScopesFor', () => {
    it('answers every scope a covering lesson teaches, from either name', () => {
        expect(lessonScopesFor('manage:ContentVerification')).toEqual([
            'manage:ContentVerification',
            'view:ContentVerification',
        ]);
        expect(lessonScopesFor('view:ContentVerification')).toEqual([
            'manage:ContentVerification',
            'view:ContentVerification',
        ]);
    });
    it('answers a lesson that covers nothing, or an unknown name, with itself', () => {
        expect(lessonScopesFor('view:Dashboard')).toEqual(['view:Dashboard']);
        expect(lessonScopesFor('view:Nothing')).toEqual(['view:Nothing']);
    });
});

describe('stepsForLeftNavigation', () => {
    const steps = tourFor('view:Dashboard')?.steps ?? [];
    const adapted = stepsForLeftNavigation(steps);

    it('never asks the learner to open a menu the sidebar does not have', () => {
        const asked = adapted.flatMap((step) => [step.target, ...step.via]);
        expect(asked).not.toContain('[data-tour-nav="browse"]');
        expect(asked).not.toContain('[data-tour-nav="new"]');
    });

    it('keeps the destination the menu led to', () => {
        expect(adapted.map((step) => step.target)).toContain(
            '[data-tour-nav="all-dashboards"]',
        );
    });

    it('leaves a lesson that never used those menus as it was', () => {
        const untouched = steps.filter(
            (step) => !step.target?.includes('data-tour-nav'),
        );
        expect(
            stepsForLeftNavigation(untouched).map((step) => step.title),
        ).toEqual(untouched.map((step) => step.title));
    });
});
