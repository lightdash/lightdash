import {
    type ApiError,
    type LearnCatalogue,
    type LearnCourse,
    type LearnEventInput,
    type LearnProgressResults,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { lightdashApi } from '../../api';
import {
    mergeRollups,
    rollupFromEvents,
    rollupFromServer,
    type Rollup,
} from './model';

const LOCAL_EVENTS_KEY = 'lightdash.learn.events.v1';
const LAST_COURSE_KEY = 'lightdash.learn.lastCourse.v1';
const LOCATION_PREFIX = 'lightdash.learn.location.';

const getLearnCatalogue = async () =>
    lightdashApi<LearnCatalogue>({
        url: '/learn/catalogue',
        method: 'GET',
        body: undefined,
    });

const getLearnCourse = async (courseId: string) =>
    lightdashApi<LearnCourse>({
        url: `/learn/courses/${encodeURIComponent(courseId)}`,
        method: 'GET',
        body: undefined,
    });

const getLearnProgress = async () =>
    lightdashApi<LearnProgressResults>({
        url: '/learn/progress',
        method: 'GET',
        body: undefined,
    });

const postLearnEvents = async (events: LearnEventInput[]) =>
    lightdashApi<{ accepted: number }>({
        url: '/learn/events',
        method: 'POST',
        body: JSON.stringify(events),
    });

export const useLearnCatalogue = () =>
    useQuery<LearnCatalogue, ApiError>({
        queryKey: ['learn-catalogue'],
        queryFn: getLearnCatalogue,
        staleTime: 5 * 60 * 1000,
        retry: false,
    });

export const useLearnCourse = (courseId: string | undefined) =>
    useQuery<LearnCourse, ApiError>({
        queryKey: ['learn-course', courseId],
        queryFn: () => getLearnCourse(courseId!),
        enabled: courseId !== undefined,
        staleTime: 5 * 60 * 1000,
        retry: false,
    });

const useLearnServerProgress = () =>
    useQuery<LearnProgressResults, ApiError>({
        queryKey: ['learn-progress'],
        queryFn: getLearnProgress,
        retry: false,
    });

function readLocalEvents(): LearnEventInput[] {
    const raw = localStorage.getItem(LOCAL_EVENTS_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw) as LearnEventInput[];
    } catch {
        return [];
    }
}

/**
 * Rollups per course, merging server progress (when the instance syncs) with
 * locally recorded events (always kept, so an unconfigured instance still has
 * per-browser progress and a later-configured one back-fills nothing worse
 * than what the learner already saw).
 */
export const useLearnRollups = () => {
    const serverProgress = useLearnServerProgress();
    const rollups = useMemo(() => {
        const map = new Map<string, Rollup>();
        const local = readLocalEvents();
        for (const courseId of new Set(local.map((ev) => ev.object.course))) {
            map.set(courseId, rollupFromEvents(local, courseId));
        }
        for (const course of serverProgress.data?.courses ?? []) {
            const server = rollupFromServer(course);
            const existing = map.get(course.courseId);
            map.set(
                course.courseId,
                existing ? mergeRollups(server, existing) : server,
            );
        }
        return map;
    }, [serverProgress.data]);
    return {
        rollups,
        isLoading: serverProgress.isInitialLoading,
        serverSynced: serverProgress.data?.serverSynced ?? false,
    };
};

export const useRecordLearnEvent = () => {
    const queryClient = useQueryClient();
    const mutation = useMutation<
        { accepted: number },
        ApiError,
        LearnEventInput[]
    >({
        mutationFn: postLearnEvents,
        onSettled: () => queryClient.invalidateQueries(['learn-progress']),
    });
    const { mutate } = mutation;
    const record = useCallback(
        (event: Omit<LearnEventInput, 'occurredAt'>) => {
            const full: LearnEventInput = {
                ...event,
                occurredAt: new Date().toISOString(),
            };
            // Local copy first: progress must never depend on the network.
            try {
                const local = readLocalEvents();
                local.push(full);
                localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(local));
            } catch {
                // Storage full or unavailable — server sync still applies.
            }
            mutate([full]);
        },
        [mutate],
    );
    return { record, isRecording: mutation.isLoading };
};

export const getLastCourseId = (): string | null =>
    localStorage.getItem(LAST_COURSE_KEY);

export const setLastCourseId = (courseId: string): void => {
    localStorage.setItem(LAST_COURSE_KEY, courseId);
};

export const getLessonBookmark = (courseId: string): string =>
    localStorage.getItem(LOCATION_PREFIX + courseId) ?? '';

export const setLessonBookmark = (courseId: string, lessonId: string): void => {
    localStorage.setItem(LOCATION_PREFIX + courseId, lessonId);
};
