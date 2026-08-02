import {
    DATA_APP_CLAUDE_MODELS,
    type DataAppActivityFilters,
    type DataAppClaudeModel,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { validate as isUuid } from 'uuid';
import useSearchParams from '../../../hooks/useSearchParams';

/**
 * Relative windows rather than an absolute range: an admin asking "who has been
 * building lately" wants a period, and it keeps the filter shareable as a URL
 * without pinning it to the day it was copied.
 */
export const DATA_APP_ACTIVITY_PERIODS = ['all', '7d', '30d', '90d'] as const;
export type DataAppActivityPeriod = (typeof DATA_APP_ACTIVITY_PERIODS)[number];

const PERIOD_DAYS: Record<Exclude<DataAppActivityPeriod, 'all'>, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
};

const DEFAULT_PERIOD: DataAppActivityPeriod = 'all';

type DataAppActivityFiltersState = {
    projectUuids: string[];
    userUuids: string[];
    models: DataAppClaudeModel[];
    period: DataAppActivityPeriod;
};

const isPeriod = (value: string | null): value is DataAppActivityPeriod =>
    value !== null &&
    (DATA_APP_ACTIVITY_PERIODS as readonly string[]).includes(value);

const isModel = (value: string): value is DataAppClaudeModel =>
    (DATA_APP_CLAUDE_MODELS as readonly string[]).includes(value);

/** Data app activity filters, persisted in the URL so a view is shareable. */
export const useDataAppActivityFilters = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const projectsParam = useSearchParams<string>('projects');
    const usersParam = useSearchParams<string>('users');
    const modelsParam = useSearchParams<string>('models');
    const periodParam = useSearchParams<string>('period');

    // Values that can't match anything (hand-edited URLs) are dropped rather
    // than sent on, so the filter UI never shows a selection it can't render.
    const selectedProjectUuids = useMemo(
        () => projectsParam?.split(',').filter(isUuid) ?? [],
        [projectsParam],
    );
    const selectedUserUuids = useMemo(
        () => usersParam?.split(',').filter(isUuid) ?? [],
        [usersParam],
    );
    const selectedModels = useMemo(
        () => modelsParam?.split(',').filter(isModel) ?? [],
        [modelsParam],
    );
    const selectedPeriod: DataAppActivityPeriod = isPeriod(periodParam)
        ? periodParam
        : DEFAULT_PERIOD;

    const updateUrl = useCallback(
        (patch: Partial<DataAppActivityFiltersState>) => {
            const next: DataAppActivityFiltersState = {
                projectUuids: selectedProjectUuids,
                userUuids: selectedUserUuids,
                models: selectedModels,
                period: selectedPeriod,
                ...patch,
            };
            const searchParams = new URLSearchParams();
            if (next.projectUuids.length > 0) {
                searchParams.set('projects', next.projectUuids.join(','));
            }
            if (next.userUuids.length > 0) {
                searchParams.set('users', next.userUuids.join(','));
            }
            if (next.models.length > 0) {
                searchParams.set('models', next.models.join(','));
            }
            if (next.period !== DEFAULT_PERIOD) {
                searchParams.set('period', next.period);
            }
            const search = searchParams.toString();
            void navigate(
                { pathname, search: search ? `?${search}` : '' },
                { replace: true },
            );
        },
        [
            navigate,
            pathname,
            selectedProjectUuids,
            selectedUserUuids,
            selectedModels,
            selectedPeriod,
        ],
    );

    const setSelectedProjectUuids = useCallback(
        (projectUuids: string[]) => updateUrl({ projectUuids }),
        [updateUrl],
    );
    const setSelectedUserUuids = useCallback(
        (userUuids: string[]) => updateUrl({ userUuids }),
        [updateUrl],
    );
    const setSelectedModels = useCallback(
        (models: string[]) => updateUrl({ models: models.filter(isModel) }),
        [updateUrl],
    );
    const setSelectedPeriod = useCallback(
        (period: DataAppActivityPeriod) => updateUrl({ period }),
        [updateUrl],
    );
    const resetFilters = useCallback(
        () =>
            updateUrl({
                projectUuids: [],
                userUuids: [],
                models: [],
                period: DEFAULT_PERIOD,
            }),
        [updateUrl],
    );

    const hasActiveFilters =
        selectedProjectUuids.length > 0 ||
        selectedUserUuids.length > 0 ||
        selectedModels.length > 0 ||
        selectedPeriod !== DEFAULT_PERIOD;

    // Memoised on the selections, not per render: this object is the react-query
    // key, and a `dateFrom` that moved every render would refetch forever.
    const apiFilters = useMemo<DataAppActivityFilters>(() => {
        const dateFrom =
            selectedPeriod === 'all'
                ? undefined
                : new Date(
                      Date.now() -
                          PERIOD_DAYS[selectedPeriod] * 24 * 60 * 60 * 1000,
                  ).toISOString();
        return {
            ...(selectedProjectUuids.length > 0 && {
                projectUuids: selectedProjectUuids,
            }),
            ...(selectedUserUuids.length > 0 && {
                userUuids: selectedUserUuids,
            }),
            ...(selectedModels.length > 0 && { models: selectedModels }),
            ...(dateFrom && { dateFrom }),
        };
    }, [
        selectedProjectUuids,
        selectedUserUuids,
        selectedModels,
        selectedPeriod,
    ]);

    return {
        selectedProjectUuids,
        selectedUserUuids,
        selectedModels,
        selectedPeriod,
        setSelectedProjectUuids,
        setSelectedUserUuids,
        setSelectedModels,
        setSelectedPeriod,
        resetFilters,
        hasActiveFilters,
        apiFilters,
    };
};
