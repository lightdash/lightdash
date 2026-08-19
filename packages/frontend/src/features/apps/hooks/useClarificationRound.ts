import {
    type AppChartReference,
    type AppClarification,
    type AppDashboardReference,
    type DataAppTemplate,
} from '@lightdash/common';
import { useCallback, useRef, useState } from 'react';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useClarifyApp } from './useClarifyApp';

/** What the clarifier is asked about, derived from the caller's request. */
export type ClarifyParams = {
    prompt: string;
    template?: DataAppTemplate;
    charts?: AppChartReference[];
    dashboard?: AppDashboardReference;
    fileIds?: string[];
};

type Args<TRequest> = {
    projectUuid: string | undefined;
    /** Only a first build clarifies; a revision is grounded in the version
     *  already on screen. */
    isFirstBuild: boolean;
    toClarifyParams: (request: TRequest) => ClarifyParams;
    onBuild: (request: TRequest, clarifications: AppClarification[]) => void;
};

export type ClarificationRound<TRequest> = {
    /** The round awaiting answers; null when no questions are on screen. */
    pending: { prompt: string; questions: string[] } | null;
    answers: string[];
    /** The prompt whose clarify request is in flight. */
    clarifyingPrompt: string | null;
    /** The clarifier could not be reached, so the build started as written. */
    fellThrough: boolean;
    send: (request: TRequest) => void;
    answer: (index: number, value: string) => void;
    /** Build with the answers given so far, or with none when skipping. */
    build: (skip: boolean) => void;
    /** Drop the round and hand its prompt back to the composer. */
    abandon: () => string | null;
    reset: () => void;
};

/** The clarifying round before a first build, shared by both builders. The
 *  clarifier is advisory, so every outcome ends in a build; a round id stops a
 *  late response reopening questions the user has already moved past. */
export const useClarificationRound = <TRequest>({
    projectUuid,
    isFirstBuild,
    toClarifyParams,
    onBuild,
}: Args<TRequest>): ClarificationRound<TRequest> => {
    const { mutateAsync: clarify } = useClarifyApp();
    const { track } = useTracking();
    const round = useRef(0);
    const inFlightRequest = useRef<AbortController | null>(null);
    const [inFlight, setInFlight] = useState<{
        request: TRequest;
        prompt: string;
        template: DataAppTemplate | undefined;
    } | null>(null);
    const [pending, setPending] = useState<{
        request: TRequest;
        prompt: string;
        template: DataAppTemplate | undefined;
        questions: string[];
    } | null>(null);
    const [answers, setAnswers] = useState<string[]>([]);
    const [fellThrough, setFellThrough] = useState(false);

    const reset = useCallback(() => {
        round.current += 1;
        inFlightRequest.current?.abort();
        inFlightRequest.current = null;
        setInFlight(null);
        setPending(null);
        setAnswers([]);
        setFellThrough(false);
    }, []);

    const report = useCallback(
        (
            outcome:
                | 'no_questions'
                | 'unreachable'
                | 'answered'
                | 'skipped'
                | 'abandoned',
            // Both builders report here, so the template is what tells the two
            // surfaces apart — `data_app_viz` is the chart type builder.
            template: DataAppTemplate | undefined,
            questionCount: number,
            answeredCount: number,
        ) =>
            track({
                name: EventName.DATA_APP_CLARIFY_ROUND_RESOLVED,
                properties: {
                    projectId: projectUuid,
                    template: template ?? null,
                    outcome,
                    questionCount,
                    answeredCount,
                },
            }),
        [projectUuid, track],
    );

    const send = useCallback(
        (request: TRequest) => {
            setFellThrough(false);
            if (!isFirstBuild || !projectUuid) {
                onBuild(request, []);
                return;
            }
            const params = toClarifyParams(request);
            round.current += 1;
            const current = round.current;
            const controller = new AbortController();
            inFlightRequest.current = controller;
            setInFlight({
                request,
                prompt: params.prompt,
                template: params.template,
            });
            // Both handlers go to the same `then` on purpose: a chained
            // `catch` would also catch a throw from the success path and build
            // a second time on a round that already built. The terminal catch
            // only ever sees such a throw, and the build reports its own
            // failures, so there is nothing left to say about it here.
            void clarify({
                projectUuid,
                ...params,
                signal: controller.signal,
            })
                .then(
                    ({ questions }) => {
                        if (current !== round.current) return;
                        inFlightRequest.current = null;
                        setInFlight(null);
                        if (questions.length === 0) {
                            report('no_questions', params.template, 0, 0);
                            onBuild(request, []);
                            return;
                        }
                        setPending({
                            request,
                            prompt: params.prompt,
                            template: params.template,
                            questions,
                        });
                        setAnswers(questions.map(() => ''));
                    },
                    () => {
                        if (current !== round.current) return;
                        inFlightRequest.current = null;
                        setInFlight(null);
                        setFellThrough(true);
                        report('unreachable', params.template, 0, 0);
                        onBuild(request, []);
                    },
                )
                .catch(() => {});
        },
        [clarify, isFirstBuild, onBuild, projectUuid, report, toClarifyParams],
    );

    const answer = useCallback((index: number, value: string) => {
        setAnswers((current) => {
            const next = [...current];
            next[index] = value;
            return next;
        });
    }, []);

    const build = useCallback(
        (skip: boolean) => {
            if (!pending) return;
            const clarifications: AppClarification[] = skip
                ? []
                : pending.questions
                      .map((question, index) => ({
                          question,
                          answer: (answers[index] ?? '').trim(),
                      }))
                      .filter((item) => item.answer.length > 0);
            const request = pending.request;
            reset();
            report(
                clarifications.length > 0 ? 'answered' : 'skipped',
                pending.template,
                pending.questions.length,
                clarifications.length,
            );
            onBuild(request, clarifications);
        },
        [answers, onBuild, pending, report, reset],
    );

    const abandon = useCallback(() => {
        const active = pending ?? inFlight;
        if (!active) return null;
        const questionCount = pending?.questions.length ?? 0;
        reset();
        report('abandoned', active.template, questionCount, 0);
        return active.prompt;
    }, [inFlight, pending, report, reset]);

    return {
        pending: pending
            ? { prompt: pending.prompt, questions: pending.questions }
            : null,
        answers,
        clarifyingPrompt: inFlight?.prompt ?? null,
        fellThrough,
        send,
        answer,
        build,
        abandon,
        reset,
    };
};
