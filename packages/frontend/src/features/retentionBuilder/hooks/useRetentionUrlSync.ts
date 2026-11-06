import {
    EVENT_ANALYTICS_DATE_PRESETS,
    RETENTION_MAX_PERIODS,
    type EventAnalyticsDatePreset,
    type Filters,
} from '@lightdash/common';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { useAppDispatch, useAppSelector } from '../store';
import {
    selectBornEvent,
    selectBreakdownDimensionId,
    selectCohortType,
    selectCriteria,
    selectCustomDateRange,
    selectDateRangePreset,
    selectEventNameFieldId,
    selectExploreName,
    selectFilters,
    selectMode,
    selectPeriods,
    selectReturnEvent,
    selectTimestampFieldId,
    selectUnit,
    selectUserIdFieldId,
    setBornEvent,
    setBreakdownDimensionId,
    setCohortType,
    setCriteria,
    setCustomDateRange,
    setDateRangePreset,
    setEventNameFieldId,
    setExploreName,
    setFilters,
    setMode,
    setPeriods,
    setReturnEvent,
    setTimestampFieldId,
    setUnit,
    setUserIdFieldId,
} from '../store/retentionBuilderSlice';
import {
    RETENTION_COHORT_TYPE_OPTIONS,
    RETENTION_CRITERIA_OPTIONS,
    RETENTION_MODE_OPTIONS,
    RETENTION_UNIT_OPTIONS,
} from '../utils/retentionConfig';

const PARAM = {
    explore: 'explore',
    timestamp: 'timestamp',
    userId: 'userId',
    eventName: 'eventName',
    breakdown: 'breakdown',
    born: 'born',
    return: 'return',
    cohortType: 'cohortType',
    unit: 'unit',
    periods: 'periods',
    criteria: 'criteria',
    mode: 'mode',
    datePreset: 'datePreset',
    dateStart: 'dateStart',
    dateEnd: 'dateEnd',
    filters: 'filters',
} as const;

const pickOption = <T extends string>(
    options: readonly { value: T }[],
    value: string | null,
): T | null => options.find((o) => o.value === value)?.value ?? null;

/** Keeps retention builder state in the URL so reports can be shared. */
export function useRetentionUrlSync() {
    const dispatch = useAppDispatch();
    const [searchParams, setSearchParams] = useSearchParams();
    const isInitialized = useRef(false);
    const isUpdatingFromUrl = useRef(false);

    const exploreName = useAppSelector(selectExploreName);
    const timestampFieldId = useAppSelector(selectTimestampFieldId);
    const userIdFieldId = useAppSelector(selectUserIdFieldId);
    const eventNameFieldId = useAppSelector(selectEventNameFieldId);
    const breakdownDimensionId = useAppSelector(selectBreakdownDimensionId);
    const bornEvent = useAppSelector(selectBornEvent);
    const returnEvent = useAppSelector(selectReturnEvent);
    const cohortType = useAppSelector(selectCohortType);
    const unit = useAppSelector(selectUnit);
    const periods = useAppSelector(selectPeriods);
    const criteria = useAppSelector(selectCriteria);
    const mode = useAppSelector(selectMode);
    const dateRangePreset = useAppSelector(selectDateRangePreset);
    const customDateRange = useAppSelector(selectCustomDateRange);
    const filters = useAppSelector(selectFilters);

    // Restore state from the URL once
    useEffect(() => {
        if (isInitialized.current) return;
        isInitialized.current = true;

        const urlExplore = searchParams.get(PARAM.explore);
        if (!urlExplore) return;

        isUpdatingFromUrl.current = true;
        dispatch(setExploreName(urlExplore));

        const setIfPresent = (
            key: string,
            action: (value: string) => { type: string },
        ) => {
            const value = searchParams.get(key);
            if (value) dispatch(action(value));
        };
        setIfPresent(PARAM.timestamp, setTimestampFieldId);
        setIfPresent(PARAM.userId, setUserIdFieldId);
        setIfPresent(PARAM.eventName, setEventNameFieldId);
        setIfPresent(PARAM.breakdown, setBreakdownDimensionId);
        setIfPresent(PARAM.born, setBornEvent);
        setIfPresent(PARAM.return, setReturnEvent);

        const urlUnit = pickOption(
            RETENTION_UNIT_OPTIONS,
            searchParams.get(PARAM.unit),
        );
        if (urlUnit) dispatch(setUnit(urlUnit));

        const urlPeriods = parseInt(searchParams.get(PARAM.periods) ?? '', 10);
        if (
            Number.isInteger(urlPeriods) &&
            urlPeriods >= 1 &&
            urlPeriods <= RETENTION_MAX_PERIODS[urlUnit ?? 'week']
        ) {
            dispatch(setPeriods(urlPeriods));
        }

        const urlCohortType = pickOption(
            RETENTION_COHORT_TYPE_OPTIONS,
            searchParams.get(PARAM.cohortType),
        );
        if (urlCohortType) dispatch(setCohortType(urlCohortType));

        const urlCriteria = pickOption(
            RETENTION_CRITERIA_OPTIONS,
            searchParams.get(PARAM.criteria),
        );
        if (urlCriteria) dispatch(setCriteria(urlCriteria));

        const urlMode = pickOption(
            RETENTION_MODE_OPTIONS,
            searchParams.get(PARAM.mode),
        );
        if (urlMode) dispatch(setMode(urlMode));

        const urlPreset = pickOption<EventAnalyticsDatePreset>(
            EVENT_ANALYTICS_DATE_PRESETS,
            searchParams.get(PARAM.datePreset),
        );
        if (urlPreset) dispatch(setDateRangePreset(urlPreset));

        const urlDateStart = searchParams.get(PARAM.dateStart);
        const urlDateEnd = searchParams.get(PARAM.dateEnd);
        if (urlDateStart || urlDateEnd) {
            dispatch(setCustomDateRange([urlDateStart, urlDateEnd]));
        }

        const urlFilters = searchParams.get(PARAM.filters);
        if (urlFilters) {
            try {
                dispatch(setFilters(JSON.parse(urlFilters) as Filters));
            } catch {
                // Ignore malformed filters in the URL
            }
        }

        setTimeout(() => {
            isUpdatingFromUrl.current = false;
        }, 0);
    }, [searchParams, dispatch]);

    // Write state to the URL
    useEffect(() => {
        if (isUpdatingFromUrl.current) return;
        if (!isInitialized.current) return;

        const params = new URLSearchParams();
        if (exploreName) {
            params.set(PARAM.explore, exploreName);
            if (timestampFieldId) params.set(PARAM.timestamp, timestampFieldId);
            if (userIdFieldId) params.set(PARAM.userId, userIdFieldId);
            if (eventNameFieldId) params.set(PARAM.eventName, eventNameFieldId);
            if (breakdownDimensionId)
                params.set(PARAM.breakdown, breakdownDimensionId);
            if (bornEvent) params.set(PARAM.born, bornEvent);
            if (returnEvent) params.set(PARAM.return, returnEvent);
            params.set(PARAM.cohortType, cohortType);
            params.set(PARAM.unit, unit);
            params.set(PARAM.periods, String(periods));
            params.set(PARAM.criteria, criteria);
            params.set(PARAM.mode, mode);
            params.set(PARAM.datePreset, dateRangePreset);
            if (dateRangePreset === 'custom') {
                if (customDateRange[0])
                    params.set(PARAM.dateStart, customDateRange[0]);
                if (customDateRange[1])
                    params.set(PARAM.dateEnd, customDateRange[1]);
            }
            if (filters.dimensions) {
                params.set(PARAM.filters, JSON.stringify(filters));
            }
        }

        setSearchParams(params, { replace: true });
    }, [
        exploreName,
        timestampFieldId,
        userIdFieldId,
        eventNameFieldId,
        breakdownDimensionId,
        bornEvent,
        returnEvent,
        cohortType,
        unit,
        periods,
        criteria,
        mode,
        dateRangePreset,
        customDateRange,
        filters,
        setSearchParams,
    ]);
}
