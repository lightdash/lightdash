import { fireEvent, screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { commonScopeSource, entry } from '../model/testFixtures';
import { LearnUiProvider } from '../scope/context';
import { renderWithMantine } from '../test/render';
import { type LearnAskMatch } from '../types';
import { AskBar, type AskBarProps } from './AskBar';

const renderBoard = (ui: ReactElement) =>
    renderWithMantine(
        <LearnUiProvider scopeSource={commonScopeSource}>{ui}</LearnUiProvider>,
    );

const entries = [
    entry({ id: 'foundation', title: 'Getting around', scope: 'view:Project' }),
    entry({
        id: 'dashboards',
        title: 'Building dashboards',
        scope: 'manage:Dashboard',
    }),
];

const match = (courseId: string, lessonId: string | null): LearnAskMatch => ({
    courseId,
    lessonId,
    title: `${courseId} lesson`,
    score: 0.7,
});

const renderBar = (overrides: Partial<AskBarProps> = {}) => {
    const props: AskBarProps = {
        entries,
        suggestions: [
            { query: 'Where do I find a chart?', courseId: 'foundation' },
        ],
        matches: null,
        lockedIds: new Set<string>(),
        isSearching: false,
        isError: false,
        onSubmit: vi.fn(),
        onClear: vi.fn(),
        onOpen: vi.fn(),
        ...overrides,
    };
    renderBoard(<AskBar {...props} />);
    return props;
};

describe('AskBar', () => {
    it('submits the typed question', () => {
        const props = renderBar();
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'email me a dashboard' },
        });
        fireEvent.submit(screen.getByRole('search'));
        expect(props.onSubmit).toHaveBeenCalledWith('email me a dashboard');
    });

    it('clears instead of searching when the box is empty', () => {
        const props = renderBar();
        fireEvent.submit(screen.getByRole('search'));
        expect(props.onSubmit).not.toHaveBeenCalled();
        expect(props.onClear).toHaveBeenCalled();
    });

    it('treats a whitespace-only question as a clear, box included', () => {
        const props = renderBar();
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: '   ' },
        });
        fireEvent.submit(screen.getByRole('search'));
        expect(props.onSubmit).not.toHaveBeenCalled();
        expect(props.onClear).toHaveBeenCalled();
        expect(screen.getByRole('searchbox')).toHaveValue('');
    });

    it('caps the box at the length the request schema accepts', () => {
        renderBar();
        expect(screen.getByRole('searchbox')).toHaveAttribute(
            'maxlength',
            '500',
        );
    });

    it('sends one request for a double submit of the same question', () => {
        const props = renderBar({ matches: [match('foundation', 'l1')] });
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'where are my charts' },
        });
        fireEvent.submit(screen.getByRole('search'));
        fireEvent.submit(screen.getByRole('search'));
        expect(props.onSubmit).toHaveBeenCalledTimes(1);
    });

    it('sends nothing while a search is already in flight', () => {
        const props = renderBar({ isSearching: true });
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'anything' },
        });
        fireEvent.submit(screen.getByRole('search'));
        expect(props.onSubmit).not.toHaveBeenCalled();
    });

    it('re-runs a question that failed', () => {
        const props = renderBar({ isError: true });
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'anything' },
        });
        fireEvent.submit(screen.getByRole('search'));
        fireEvent.submit(screen.getByRole('search'));
        expect(props.onSubmit).toHaveBeenCalledTimes(2);
    });

    it('runs a suggestion chip as a query', () => {
        const props = renderBar();
        fireEvent.click(
            screen.getByRole('button', { name: 'Where do I find a chart?' }),
        );
        expect(props.onSubmit).toHaveBeenCalledWith('Where do I find a chart?');
    });

    it('groups results by module and opens the matched lesson', () => {
        const props = renderBar({ matches: [match('foundation', 'l2')] });
        expect(screen.getByText('Getting around')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Open' }));
        expect(props.onOpen).toHaveBeenCalledWith('foundation', 'l2');
    });

    it('names the lowest holding role for a locked match instead of opening it', () => {
        renderBar({
            matches: [match('dashboards', 'l1')],
            lockedIds: new Set(['dashboards']),
        });
        // manage:Dashboard is held from interactive viewer up via space access.
        expect(
            screen.getByText('interactive viewer and above'),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Open' }),
        ).not.toBeInTheDocument();
    });

    it('shows the empty copy when nothing matched', () => {
        renderBar({ matches: [] });
        expect(
            screen.getByText('Nothing in the library matches that yet'),
        ).toBeInTheDocument();
    });

    it('shows the failure copy when the search request failed', () => {
        renderBar({ isError: true });
        expect(
            screen.getByText("Couldn't search right now"),
        ).toBeInTheDocument();
    });

    it('clears the box and the board with the clear button', () => {
        const props = renderBar({ matches: [match('foundation', 'l1')] });
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'anything' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
        expect(screen.getByRole('searchbox')).toHaveValue('');
        expect(props.onClear).toHaveBeenCalled();
    });

    it('leaves focus on the input when the clear button unmounts itself', () => {
        renderBar({ matches: [match('foundation', 'l1')] });
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'anything' },
        });
        const clear = screen.getByRole('button', { name: 'Clear search' });
        clear.focus();
        fireEvent.click(clear);
        expect(screen.getByRole('searchbox')).toHaveFocus();
    });
});
