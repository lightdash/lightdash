import { describe, expect, it } from 'vitest';
import {
    getContentEditCalloutActions,
    hasContentEditCalloutActions,
} from './contentEditCallout';

describe('getContentEditCalloutActions', () => {
    it('shows enable when the user can manage the agent', () => {
        expect(
            getContentEditCalloutActions({
                canManageAgent: true,
                capableAgent: null,
            }),
        ).toEqual({ showEnable: true, routeAgent: null });
    });

    it('shows route when a capable sibling agent exists', () => {
        const agent = { uuid: 'a1', name: 'Builder' };
        expect(
            getContentEditCalloutActions({
                canManageAgent: false,
                capableAgent: agent,
            }),
        ).toEqual({ showEnable: false, routeAgent: agent });
    });

    it('shows both when both apply', () => {
        const agent = { uuid: 'a1', name: 'Builder' };
        expect(
            getContentEditCalloutActions({
                canManageAgent: true,
                capableAgent: agent,
            }),
        ).toEqual({ showEnable: true, routeAgent: agent });
    });

    it('renders nothing when neither applies', () => {
        const result = getContentEditCalloutActions({
            canManageAgent: false,
            capableAgent: null,
        });
        expect(result.showEnable).toBe(false);
        expect(result.routeAgent).toBe(null);
    });
});

describe('hasContentEditCalloutActions', () => {
    it('returns true when showEnable is true', () => {
        expect(
            hasContentEditCalloutActions({
                showEnable: true,
                routeAgent: null,
            }),
        ).toBe(true);
    });

    it('returns true when routeAgent is set', () => {
        expect(
            hasContentEditCalloutActions({
                showEnable: false,
                routeAgent: { uuid: 'a1', name: 'Builder' },
            }),
        ).toBe(true);
    });

    it('returns false when neither is set', () => {
        expect(
            hasContentEditCalloutActions({
                showEnable: false,
                routeAgent: null,
            }),
        ).toBe(false);
    });
});
