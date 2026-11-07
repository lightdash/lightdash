import { describe, expect, it } from 'vitest';
import { isSameDraft, toFieldChange, toFieldDraft } from './fieldDraft';
import { type Field } from './model';

const field = {
    name: 'event',
    label: 'Event',
    description: '',
    aiHint: '',
    group: ' Session ',
    inUse: true,
} as Field;

describe('fieldDraft', () => {
    const saved = toFieldDraft(field);

    it('treats a group with stray spaces as unchanged', () => {
        expect(isSameDraft(saved, saved)).toBe(true);
        expect(toFieldChange('event', saved, saved)).toEqual({ name: 'event' });
    });

    it('sends only the trimmed group when it changed', () => {
        const draft = { ...saved, group: '  Basics ' };
        expect(isSameDraft(draft, saved)).toBe(false);
        expect(toFieldChange('event', draft, saved)).toEqual({
            name: 'event',
            group: 'Basics',
        });
    });

    it('sends null for an emptied group or label', () => {
        expect(
            toFieldChange('event', { ...saved, group: ' ', label: '' }, saved),
        ).toEqual({ name: 'event', group: null, label: null });
    });
});
