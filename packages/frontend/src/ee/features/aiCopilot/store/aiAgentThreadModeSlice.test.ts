import { describe, expect, it } from 'vitest';
import {
    aiAgentThreadModeSlice,
    selectThreadSqlMode,
    selectThreadSqlModeRaw,
    setThreadSqlMode,
} from './aiAgentThreadModeSlice';

const { reducer } = aiAgentThreadModeSlice;

const wrap = (aiAgentThreadMode: ReturnType<typeof reducer>) => ({
    aiAgentThreadMode,
});

describe('aiAgentThreadModeSlice', () => {
    it('selectThreadSqlMode defaults to true for an unknown thread', () => {
        const state = wrap(reducer(undefined, { type: '@@init' }));
        expect(selectThreadSqlMode('t1')(state)).toBe(true);
    });

    it('selectThreadSqlModeRaw is undefined until the thread is toggled', () => {
        const state = wrap(reducer(undefined, { type: '@@init' }));
        expect(selectThreadSqlModeRaw('t1')(state)).toBeUndefined();
    });

    it('reflects the stored value once set', () => {
        const next = reducer(
            undefined,
            setThreadSqlMode({ threadUuid: 't1', enabled: false }),
        );
        const state = wrap(next);
        expect(selectThreadSqlModeRaw('t1')(state)).toBe(false);
        expect(selectThreadSqlMode('t1')(state)).toBe(false);
    });
});
