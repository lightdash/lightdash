import {
    type ApiError,
    type LearnCatalogue,
    type LearnCourse,
    type LearnEventInput,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { lightdashApi } from '../../api';
import { rollupFromEvents, type Rollup } from './model';

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
 * Rollups per course from locally recorded events. Server-synced progress
 * arrives with the progress-sync slice — local events are always kept, so an
 * unconfigured instance still has per-browser progress.
 */
export const useLearnRollups = () => {
    // Computed once per mount; the progress-sync slice makes this live-update
    // by keying recomputation off the server progress query.
    const [rollups] = useState(() => {
        const map = new Map<string, Rollup>();
        const local = readLocalEvents();
        for (const courseId of new Set(local.map((ev) => ev.object.course))) {
            map.set(courseId, rollupFromEvents(local, courseId));
        }
        return map;
    });
    return { rollups, isLoading: false, serverSynced: false };
};

export const useRecordLearnEvent = () => {
    const record = useCallback((event: Omit<LearnEventInput, 'occurredAt'>) => {
        const full: LearnEventInput = {
            ...event,
            occurredAt: new Date().toISOString(),
        };
        // Local copy: progress must never depend on the network.
        try {
            const local = readLocalEvents();
            local.push(full);
            localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(local));
        } catch {
            // Storage full or unavailable — nothing else to do locally.
        }
    }, []);
    return { record, isRecording: false };
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
