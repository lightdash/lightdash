import { type LiveSourceField } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    filterFields,
    getFieldChange,
    getGroups,
    getViewFields,
} from './liveSourceFieldsView';

const field = (overrides: Partial<LiveSourceField>): LiveSourceField => ({
    name: 'event',
    apiName: 'event',
    kind: 'dimension',
    type: 'string',
    label: 'Event name',
    description: 'Name of the event.',
    aiHint: null,
    group: null,
    isBuiltIn: true,
    isInternal: false,
    isRequired: false,
    inUse: true,
    usedByChartCount: 0,
    lastEdit: null,
    ...overrides,
});

const event = field({});
const plan = field({
    name: 'person_plan',
    apiName: 'person.properties.plan',
    label: 'Person plan',
    description: 'Billing plan.',
    group: 'Person',
    isBuiltIn: false,
    inUse: false,
});
const libVersion = field({
    name: 'property_lib_version',
    apiName: 'properties.$lib_version',
    label: '$lib_version',
    isBuiltIn: false,
    isInternal: true,
    inUse: false,
});
const count = field({
    name: 'event_count',
    kind: 'metric',
    type: 'count',
    label: 'Events',
    group: 'Basics',
});
const fields = [event, plan, libVersion, count];

describe('getViewFields', () => {
    it('shows every field but internal ones by default', () => {
        expect(
            getViewFields(fields, { view: 'all', showInternal: false }),
        ).toEqual([event, plan, count]);
    });

    it('shows internal fields when asked', () => {
        expect(
            getViewFields(fields, { view: 'available', showInternal: true }),
        ).toEqual([plan, libVersion]);
    });

    it('always shows an internal field that is in use', () => {
        const inUse = { ...libVersion, inUse: true };
        expect(
            getViewFields([inUse], { view: 'inUse', showInternal: false }),
        ).toEqual([inUse]);
    });
});

describe('filterFields', () => {
    it('searches labels, sources and descriptions', () => {
        const byText = (search: string) =>
            filterFields(fields, { search, kinds: [], groups: [] });
        expect(byText('properties.plan')).toEqual([plan]);
        expect(byText('billing')).toEqual([plan]);
        expect(byText('  EVENTS ')).toEqual([count]);
    });

    it('narrows by type and group', () => {
        expect(
            filterFields(fields, { search: '', kinds: ['metric'], groups: [] }),
        ).toEqual([count]);
        expect(
            filterFields(fields, { search: '', kinds: [], groups: ['Person'] }),
        ).toEqual([plan]);
    });
});

describe('getGroups', () => {
    it('lists each group once, sorted', () => {
        expect(getGroups([...fields, plan])).toEqual(['Basics', 'Person']);
    });
});

describe('getFieldChange', () => {
    const editable = {
        label: event.label,
        description: event.description,
        aiHint: event.aiHint,
        group: event.group,
    };

    it('sends nothing when nothing changed', () => {
        expect(
            getFieldChange(event, { ...editable, label: ' Event name ' }),
        ).toBeNull();
    });

    it('sends only the changed keys', () => {
        expect(
            getFieldChange(event, {
                ...editable,
                label: 'Event',
                group: ' Basics ',
            }),
        ).toEqual({ name: 'event', label: 'Event', group: 'Basics' });
    });

    it('clears an AI hint or group that was emptied', () => {
        const edited = { ...count, aiHint: 'Use for traffic' };
        expect(
            getFieldChange(edited, {
                label: edited.label,
                description: edited.description,
                aiHint: '  ',
                group: '',
            }),
        ).toEqual({ name: 'event_count', aiHint: null, group: null });
    });
});
