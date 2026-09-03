import { describe, expect, it } from 'vitest';
import {
    addThreadElementReference,
    aiAgentThreadElementRefsSlice,
    clearThreadElementReferences,
    removeThreadElementReference,
    selectThreadElementReferences,
    type ThreadElementReference,
} from './aiAgentThreadElementRefsSlice';

const { reducer } = aiAgentThreadElementRefsSlice;

const wrap = (aiAgentThreadElementRefs: ReturnType<typeof reducer>) => ({
    aiAgentThreadElementRefs,
});

const heading: ThreadElementReference = {
    appUuid: 'app-1',
    appSlug: 'f1-standings',
    appDisplayName: 'F1 standings',
    version: 3,
    tag: 'h1',
    text: 'FORMULA 1',
    loc: 'src/App.jsx:14',
};

const button: ThreadElementReference = {
    ...heading,
    tag: 'button',
    text: 'Send',
    loc: '',
};

const reduce = (...actions: Parameters<typeof reducer>[1][]) =>
    actions.reduce(reducer, reducer(undefined, { type: '@@init' }));

describe('aiAgentThreadElementRefsSlice', () => {
    it('has no references for an unknown thread', () => {
        const state = wrap(reduce());
        expect(selectThreadElementReferences('t1')(state)).toEqual([]);
    });

    it('adds references in pick order, per thread', () => {
        const state = wrap(
            reduce(
                addThreadElementReference({
                    threadUuid: 't1',
                    reference: heading,
                }),
                addThreadElementReference({
                    threadUuid: 't1',
                    reference: button,
                }),
                addThreadElementReference({
                    threadUuid: 't2',
                    reference: button,
                }),
            ),
        );
        expect(selectThreadElementReferences('t1')(state)).toEqual([
            heading,
            button,
        ]);
        expect(selectThreadElementReferences('t2')(state)).toEqual([button]);
    });

    it('collapses the same element picked twice from the same version', () => {
        const state = wrap(
            reduce(
                addThreadElementReference({
                    threadUuid: 't1',
                    reference: heading,
                }),
                addThreadElementReference({
                    threadUuid: 't1',
                    reference: { ...heading, appDisplayName: 'renamed' },
                }),
            ),
        );
        expect(selectThreadElementReferences('t1')(state)).toEqual([heading]);
    });

    it('keeps the same element picked from another version', () => {
        const state = wrap(
            reduce(
                addThreadElementReference({
                    threadUuid: 't1',
                    reference: heading,
                }),
                addThreadElementReference({
                    threadUuid: 't1',
                    reference: { ...heading, version: 4 },
                }),
            ),
        );
        expect(selectThreadElementReferences('t1')(state)).toHaveLength(2);
    });

    it('removes one reference and leaves the rest', () => {
        const state = wrap(
            reduce(
                addThreadElementReference({
                    threadUuid: 't1',
                    reference: heading,
                }),
                addThreadElementReference({
                    threadUuid: 't1',
                    reference: button,
                }),
                removeThreadElementReference({
                    threadUuid: 't1',
                    reference: heading,
                }),
            ),
        );
        expect(selectThreadElementReferences('t1')(state)).toEqual([button]);
    });

    it('clears only the given thread', () => {
        const state = wrap(
            reduce(
                addThreadElementReference({
                    threadUuid: 't1',
                    reference: heading,
                }),
                addThreadElementReference({
                    threadUuid: 't2',
                    reference: heading,
                }),
                clearThreadElementReferences({ threadUuid: 't1' }),
            ),
        );
        expect(selectThreadElementReferences('t1')(state)).toEqual([]);
        expect(selectThreadElementReferences('t2')(state)).toEqual([heading]);
    });
});
