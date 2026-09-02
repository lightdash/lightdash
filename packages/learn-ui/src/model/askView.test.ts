import { describe, expect, it } from 'vitest';
import { ProjectMemberRole } from '../scope/types';
import { type LearnAskMatch } from '../types';
import { createAskModel } from './ask';
import {
    ASK_RESULT_LIMIT,
    askOpacity,
    askScale,
    createAskViewModel,
    groupMatches,
    nodeAskState,
    resolveMatches,
} from './askView';
import { createBoardModel } from './model';
import { commonScopeSource, entry } from './testFixtures';

const entries = [
    entry({ id: 'foundation', scope: 'view:Project' }),
    entry({ id: 'dashboards', scope: 'manage:Dashboard' }),
    entry({ id: 'spaces', scope: 'manage:Space' }),
];

const board = createBoardModel(commonScopeSource);
const ask = createAskModel(board);
const askView = createAskViewModel(board, ask);

const viewerScopes = commonScopeSource.getAllScopesForRole(
    ProjectMemberRole.VIEWER,
);

const match = (courseId: string, score: number): LearnAskMatch => ({
    courseId,
    lessonId: 'l1',
    title: `${courseId} lesson`,
    score,
});

describe('resolveMatches', () => {
    it('drops matches naming a module this catalogue does not carry', () => {
        expect(
            resolveMatches(
                [match('retired-module', 0.9), match('foundation', 0.8)],
                entries,
            ),
        ).toEqual([match('foundation', 0.8)]);
    });

    it('caps the list once, so the board and the list light the same set', () => {
        const many = Array.from({ length: 8 }, (_, i) =>
            match('foundation', 1 - i / 10),
        );
        expect(resolveMatches(many, entries)).toHaveLength(ASK_RESULT_LIMIT);
    });
});

describe('boardHighlights', () => {
    it('splits held matches from locked ones', () => {
        const highlights = askView.boardHighlights(
            [match('foundation', 0.8), match('dashboards', 0.6)],
            entries,
            viewerScopes,
        );
        expect([...highlights.matched]).toEqual(['foundation']);
        expect([...highlights.locked]).toEqual(['dashboards']);
    });
});

describe('nodeAskState', () => {
    const highlights = {
        matched: new Set(['foundation']),
        locked: new Set(['dashboards']),
    };

    it('is none when nothing is highlighted', () => {
        expect(nodeAskState('foundation', null)).toBe('none');
    });

    it('marks matched, locked and dimmed nodes', () => {
        expect(nodeAskState('foundation', highlights)).toBe('matched');
        expect(nodeAskState('dashboards', highlights)).toBe('locked-match');
        expect(nodeAskState('spaces', highlights)).toBe('dimmed');
    });
});

describe('askOpacity / askScale', () => {
    it('leaves untouched and matched nodes on their motion values', () => {
        expect(askOpacity('none', 1)).toBe(1);
        expect(askOpacity('matched', 1)).toBe(1);
        expect(askScale('matched', 1)).toBe(1);
    });

    it('dims everything else to 40 percent of its motion opacity', () => {
        expect(askOpacity('dimmed', 1)).toBe(0.4);
        expect(askOpacity('dimmed', 0)).toBe(0);
    });

    it('surfaces a locked match that motion would have hidden', () => {
        expect(askOpacity('locked-match', 0)).toBe(0.4);
        expect(askScale('locked-match', 0.3)).toBe(1);
    });
});

describe('groupMatches', () => {
    it('groups by module and keeps first-seen order', () => {
        expect(
            groupMatches([
                match('dashboards', 0.9),
                match('foundation', 0.8),
                { ...match('dashboards', 0.7), lessonId: 'l2' },
            ]),
        ).toEqual([
            {
                courseId: 'dashboards',
                matches: [
                    match('dashboards', 0.9),
                    { ...match('dashboards', 0.7), lessonId: 'l2' },
                ],
            },
            { courseId: 'foundation', matches: [match('foundation', 0.8)] },
        ]);
    });
});

describe('lockedNote', () => {
    it('names the lowest role that holds the module', () => {
        // 'manage:Dashboard' is held from interactive viewer up (the
        // '@space' variant satisfies it, see model.test.ts), so this uses
        // 'manage:Tags', which has no scoped lower-tier variant and is
        // genuinely editor-and-above.
        expect(
            askView.lockedNote(entry({ id: 'tags', scope: 'manage:Tags' })),
        ).toBe('editor and above');
    });

    it('says custom roles only when there is no system role to name', () => {
        // An untagged module is held by every system role, so lockedLabel has
        // nothing to name and the pane still needs a line.
        expect(askView.lockedNote(entry({ id: 'x', scope: null }))).toBe(
            'custom roles only',
        );
    });
});
