import {
    type AppClarification,
    type DataAppClaudeModel,
} from '@lightdash/common';
import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '../../../testing/testUtils';
import { useClarificationRound } from './useClarificationRound';
import { useClarifyApp } from './useClarifyApp';

vi.mock('./useClarifyApp', () => ({ useClarifyApp: vi.fn() }));

/** Stands in for a caller's request shape; the hook is generic over it. */
type TestRequest = {
    description: string;
    fileIds: string[];
    claudeModel: DataAppClaudeModel;
    clarifications: AppClarification[];
};

const track = vi.fn();
vi.mock('../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track }),
}));

const mockedClarify = vi.mocked(useClarifyApp);

const request = (overrides: Partial<TestRequest> = {}): TestRequest => ({
    description: 'show revenue split by team',
    fileIds: [],
    claudeModel: 'sonnet',
    clarifications: [],
    ...overrides,
});

const toClarifyParams = (item: TestRequest) => ({
    prompt: item.description,
    template: 'data_app_viz' as const,
    fileIds: item.fileIds.length > 0 ? item.fileIds : undefined,
});

describe('useClarificationRound', () => {
    let clarify: ReturnType<typeof vi.fn>;
    let onBuild: (
        request: TestRequest,
        clarifications: AppClarification[],
    ) => void;

    const setup = (isFirstBuild = true) =>
        renderHookWithProviders(() =>
            useClarificationRound<TestRequest>({
                projectUuid: 'project-1',
                isFirstBuild,
                toClarifyParams,
                onBuild,
            }),
        );

    beforeEach(() => {
        vi.clearAllMocks();
        onBuild = vi.fn();
        track.mockClear();
        clarify = vi.fn().mockResolvedValue({ questions: [] });
        mockedClarify.mockReturnValue({
            mutateAsync: clarify,
        } as unknown as ReturnType<typeof useClarifyApp>);
    });

    it('asks the clarifier before a first build, and holds the build back', async () => {
        clarify.mockResolvedValue({
            questions: ['Over time, or one period?', 'Absolute, or share?'],
        });
        const { result } = setup();

        act(() => result.current.send(request()));

        await waitFor(() =>
            expect(result.current.pending?.questions).toHaveLength(2),
        );
        expect(clarify).toHaveBeenCalledWith({
            projectUuid: 'project-1',
            prompt: 'show revenue split by team',
            template: 'data_app_viz',
            fileIds: undefined,
            signal: expect.any(AbortSignal),
        });
        expect(onBuild).not.toHaveBeenCalled();
    });

    it('builds straight away when the prompt needs no questions', async () => {
        const { result } = setup();

        act(() => result.current.send(request()));

        await waitFor(() => expect(onBuild).toHaveBeenCalledTimes(1));
        expect(result.current.pending).toBeNull();
        expect(result.current.fellThrough).toBe(false);
    });

    it('builds anyway, and says so, when the clarifier cannot be reached', async () => {
        clarify.mockRejectedValue(new Error('network'));
        const { result } = setup();

        act(() => result.current.send(request()));

        await waitFor(() => expect(result.current.fellThrough).toBe(true));
        expect(onBuild).toHaveBeenCalledWith(request(), []);
    });

    it('never asks on a revision', async () => {
        const { result } = setup(false);

        act(() => result.current.send(request()));

        await waitFor(() => expect(onBuild).toHaveBeenCalledTimes(1));
        expect(clarify).not.toHaveBeenCalled();
    });

    it('folds answered questions into the build and drops the blanks', async () => {
        clarify.mockResolvedValue({
            questions: ['Over time, or one period?', 'Absolute, or share?'],
        });
        const { result } = setup();

        act(() => result.current.send(request()));
        await waitFor(() => expect(result.current.pending).not.toBeNull());

        act(() => result.current.answer(0, '  monthly  '));
        act(() => result.current.build(false));

        expect(onBuild).toHaveBeenCalledWith(request(), [
            { question: 'Over time, or one period?', answer: 'monthly' },
        ]);
        expect(result.current.pending).toBeNull();
    });

    it('skips with no answers at all', async () => {
        clarify.mockResolvedValue({ questions: ['Over time?'] });
        const { result } = setup();

        act(() => result.current.send(request()));
        await waitFor(() => expect(result.current.pending).not.toBeNull());

        act(() => result.current.answer(0, 'monthly'));
        act(() => result.current.build(true));

        expect(onBuild).toHaveBeenCalledWith(request(), []);
    });

    it('hands the prompt back when the round is abandoned mid-flight', async () => {
        let resolveClarify: (value: { questions: string[] }) => void = () => {};
        clarify.mockReturnValue(
            new Promise<{ questions: string[] }>((resolve) => {
                resolveClarify = resolve;
            }),
        );
        const { result } = setup();

        act(() => result.current.send(request()));
        expect(result.current.clarifyingPrompt).toBe(
            'show revenue split by team',
        );

        let abandoned: string | null = null;
        act(() => {
            abandoned = result.current.abandon();
        });
        expect(abandoned).toBe('show revenue split by team');

        // The request goes with it: nobody is waiting on that answer.
        expect(clarify.mock.lastCall?.[0].signal.aborted).toBe(true);

        // A late answer cannot reopen a round the user walked away from.
        await act(async () => {
            resolveClarify({ questions: ['Over time?'] });
        });
        expect(result.current.pending).toBeNull();
        expect(onBuild).not.toHaveBeenCalled();
    });

    it('reports how every round ended', async () => {
        clarify.mockResolvedValue({ questions: ['Over time?', 'Or share?'] });
        const { result } = setup();

        act(() => result.current.send(request()));
        await waitFor(() => expect(result.current.pending).not.toBeNull());
        act(() => result.current.answer(0, 'monthly'));
        act(() => result.current.build(false));

        expect(track).toHaveBeenCalledWith({
            name: 'data_app.clarify_round_resolved',
            properties: {
                projectId: 'project-1',
                // Tells the two builders apart on one shared event.
                template: 'data_app_viz',
                outcome: 'answered',
                questionCount: 2,
                answeredCount: 1,
            },
        });

        // An empty question list is the shape a failed clarifier arrives in,
        // so it has to be visible as its own outcome.
        track.mockClear();
        clarify.mockResolvedValue({ questions: [] });
        act(() => result.current.send(request()));
        await waitFor(() =>
            expect(track).toHaveBeenCalledWith(
                expect.objectContaining({
                    properties: expect.objectContaining({
                        outcome: 'no_questions',
                    }),
                }),
            ),
        );
    });

    it('builds once when the build itself throws', async () => {
        // The no-questions path builds from inside the clarify handler. A
        // throw there must not be read as the clarifier failing and start a
        // second build.
        onBuild = vi.fn(() => {
            throw new Error('generate blew up');
        });
        const { result } = setup();

        act(() => result.current.send(request()));

        await waitFor(() => expect(onBuild).toHaveBeenCalledTimes(1));
        expect(result.current.fellThrough).toBe(false);
        expect(track).toHaveBeenCalledTimes(1);
        expect(track).toHaveBeenCalledWith(
            expect.objectContaining({
                properties: expect.objectContaining({
                    outcome: 'no_questions',
                }),
            }),
        );
    });
});
