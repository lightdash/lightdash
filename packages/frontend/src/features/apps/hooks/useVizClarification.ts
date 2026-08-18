import {
    DATA_APP_VIZ_TEMPLATE,
    type AppClarification,
} from '@lightdash/common';
import { useCallback, useRef, useState } from 'react';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useClarifyApp } from './useClarifyApp';
import { type VizBuildRequest } from './useDataAppVizBuild';

type Args = {
    projectUuid: string | undefined;
    /** Only a first build clarifies; a revision is grounded in the version
     *  already on screen. */
    isFirstBuild: boolean;
    onBuild: (request: VizBuildRequest) => void;
};

export type VizClarification = {
    /** The round awaiting answers; null when no questions are on screen. */
    pending: { prompt: string; questions: string[] } | null;
    answers: string[];
    /** The prompt whose clarify request is in flight. */
    clarifyingPrompt: string | null;
    /** The clarifier could not be reached, so the build started as written. */
    fellThrough: boolean;
    send: (request: VizBuildRequest) => void;
    answer: (index: number, value: string) => void;
    /** Build with the answers given so far, or with none when skipping. */
    build: (skip: boolean) => void;
    /** Drop the round and hand its prompt back to the composer. */
    abandon: () => string | null;
    reset: () => void;
};

/** The clarifying round before a first build. The clarifier is advisory, so
 *  every outcome ends in a build; a round id stops a late response reopening
 *  questions the user has already moved past. */
export const useVizClarification = ({
    projectUuid,
    isFirstBuild,
    onBuild,
}: Args): VizClarification => {
    const { mutateAsync: clarify } = useClarifyApp();
    const { track } = useTracking();
    const round = useRef(0);
    const inFlightRequest = useRef<AbortController | null>(null);
    const [inFlight, setInFlight] = useState<VizBuildRequest | null>(null);
    const [pending, setPending] = useState<{
        request: VizBuildRequest;
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
            questionCount: number,
            answeredCount: number,
        ) =>
            track({
                name: EventName.DATA_APP_CLARIFY_ROUND_RESOLVED,
                properties: {
                    projectId: projectUuid,
                    outcome,
                    questionCount,
                    answeredCount,
                },
            }),
        [projectUuid, track],
    );

    const send = useCallback(
        (request: VizBuildRequest) => {
            setFellThrough(false);
            if (!isFirstBuild || !projectUuid) {
                onBuild(request);
                return;
            }
            round.current += 1;
            const current = round.current;
            const controller = new AbortController();
            inFlightRequest.current = controller;
            setInFlight(request);
            void clarify({
                projectUuid,
                prompt: request.description,
                template: DATA_APP_VIZ_TEMPLATE,
                fileIds:
                    request.fileIds.length > 0 ? request.fileIds : undefined,
                signal: controller.signal,
            })
                .then(({ questions }) => {
                    if (current !== round.current) return;
                    inFlightRequest.current = null;
                    setInFlight(null);
                    if (questions.length === 0) {
                        report('no_questions', 0, 0);
                        onBuild(request);
                        return;
                    }
                    setPending({ request, questions });
                    setAnswers(questions.map(() => ''));
                })
                .catch(() => {
                    if (current !== round.current) return;
                    inFlightRequest.current = null;
                    setInFlight(null);
                    setFellThrough(true);
                    report('unreachable', 0, 0);
                    onBuild(request);
                });
        },
        [clarify, isFirstBuild, onBuild, projectUuid, report],
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
                pending.questions.length,
                clarifications.length,
            );
            onBuild({ ...request, clarifications });
        },
        [answers, onBuild, pending, report, reset],
    );

    const abandon = useCallback(() => {
        const prompt = pending?.request.description ?? inFlight?.description;
        if (prompt === undefined) return null;
        const questionCount = pending?.questions.length ?? 0;
        reset();
        report('abandoned', questionCount, 0);
        return prompt;
    }, [inFlight, pending, report, reset]);

    return {
        pending: pending
            ? {
                  prompt: pending.request.description,
                  questions: pending.questions,
              }
            : null,
        answers,
        clarifyingPrompt: inFlight?.description ?? null,
        fellThrough,
        send,
        answer,
        build,
        abandon,
        reset,
    };
};
