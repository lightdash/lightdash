import { type ApiError, type LearnCatalogue } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import { type Rollup } from './model';

const LAST_COURSE_KEY = 'lightdash.learn.lastCourse.v1';

const getLearnCatalogue = async () =>
    lightdashApi<LearnCatalogue>({
        url: '/learn/catalogue',
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

/**
 * Rollups per course. Progress arrives with the course-player and
 * progress-sync slices — until then every course renders as not started.
 */
export const useLearnRollups = () => ({
    rollups: new Map<string, Rollup>(),
    isLoading: false,
    serverSynced: false,
});

export const getLastCourseId = (): string | null =>
    localStorage.getItem(LAST_COURSE_KEY);
