import { screen } from '@testing-library/react';
import { createRef, type ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { type Rollup } from '../model/rollup';
import { commonScopeSource, entry } from '../model/testFixtures';
import { LearnUiProvider } from '../scope/context';
import { ProjectMemberRole } from '../scope/types';
import { renderWithMantine } from '../test/render';
import { ClusterBoard } from './ClusterBoard';

const entries = [
    entry({ id: 'foundation', title: 'Getting around', scope: 'view:Project' }),
    // Untagged, so every role holds it: a second lit node with no scope guesswork.
    entry({ id: 'sharing', title: 'Sharing your work', scope: null }),
    entry({
        id: 'dashboards',
        title: 'Building dashboards',
        scope: 'manage:Dashboard',
    }),
];

type BoardOverrides = Partial<
    Pick<
        ComponentProps<typeof ClusterBoard>,
        'prevHeld' | 'origin' | 'reducedMotion'
    >
>;

const renderBoard = (
    highlights: { matched: Set<string>; locked: Set<string> } | null,
    nextUpId: string | null = null,
    overrides: BoardOverrides = {},
) =>
    renderWithMantine(
        <LearnUiProvider scopeSource={commonScopeSource}>
            <ClusterBoard
                entries={entries}
                held={commonScopeSource.getAllScopesForRole(
                    ProjectMemberRole.VIEWER,
                )}
                prevHeld={null}
                rollups={new Map<string, Rollup>()}
                selectedId={null}
                nextUpId={nextUpId}
                origin={null}
                burst={false}
                reducedMotion
                highlights={highlights}
                onSelect={() => {}}
                boardRef={createRef<HTMLDivElement>()}
                {...overrides}
            />
        </LearnUiProvider>,
    );

const nodeFor = (title: string): HTMLElement => {
    const node = screen
        .getByTestId('learn-board')
        .querySelector<HTMLElement>(`[aria-label^="${title}"]`);
    if (!node) throw new Error(`no node for ${title}`);
    return node;
};

describe('ClusterBoard ask states', () => {
    it('leaves every node at full opacity with no highlights', () => {
        renderBoard(null);
        expect(nodeFor('Getting around').style.opacity).toBe('1');
        expect(nodeFor('Sharing your work').style.opacity).toBe('1');
    });

    it('dims the modules an answer did not match', () => {
        renderBoard({
            matched: new Set(['foundation']),
            locked: new Set<string>(),
        });
        expect(nodeFor('Getting around').style.opacity).toBe('1');
        expect(nodeFor('Sharing your work').style.opacity).toBe('0.4');
    });

    it('pulses the next-up module while nothing is lit', () => {
        renderBoard(null, 'sharing');
        expect(nodeFor('Sharing your work').className).toMatch(/nodeNextUp/);
    });

    it('drops the next-up pulse while an answer is lit', () => {
        // Two highlights at once read as two answers, so the glow wins.
        renderBoard(
            { matched: new Set(['foundation']), locked: new Set<string>() },
            'sharing',
        );
        expect(nodeFor('Sharing your work').className).not.toMatch(
            /nodeNextUp/,
        );
    });

    it('surfaces a locked match that would otherwise be invisible', () => {
        renderBoard({
            matched: new Set<string>(),
            locked: new Set(['dashboards']),
        });
        const locked = nodeFor('Building dashboards');
        expect(locked.style.opacity).toBe('0.4');
        expect(locked.style.transform).toBe('scale(1)');
    });

    it('keeps a locked match at its seat through a role switch', () => {
        const highlights = {
            matched: new Set<string>(),
            locked: new Set(['dashboards']),
        };
        const { unmount } = renderBoard(highlights);
        const settled = nodeFor('Building dashboards');
        const seat = { left: settled.style.left, top: settled.style.top };
        unmount();

        // Editor to viewer: dashboards flies out to the tab above the board,
        // which is where the answer would otherwise paint its ring.
        renderBoard(highlights, null, {
            prevHeld: commonScopeSource.getAllScopesForRole(
                ProjectMemberRole.EDITOR,
            ),
            origin: { x: 540, y: -60 },
            reducedMotion: false,
        });
        const locked = nodeFor('Building dashboards');
        expect(locked.style.left).toBe(seat.left);
        expect(locked.style.top).toBe(seat.top);
        expect(locked.style.transform).toBe('scale(1)');
        expect(locked.style.opacity).toBe('0.4');
    });
});
