import { type FunnelDatePreset, type FunnelStep } from '@lightdash/common';
import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { useAppDispatch, useAppSelector } from '../store';
import {
    selectBreakdownDimensionId,
    selectConversionWindowUnit,
    selectConversionWindowValue,
    selectCustomDateRange,
    selectDateRangePreset,
    selectEventNameFieldId,
    selectExploreName,
    selectSteps,
    selectTimestampFieldId,
    selectUserIdFieldId,
    setBreakdownDimensionId,
    setConversionWindowUnit,
    setConversionWindowValue,
    setCustomDateRange,
    setDateRangePreset,
    setEventNameFieldId,
    setExploreName,
    setSteps,
    setTimestampFieldId,
    setUserIdFieldId,
} from '../store/funnelBuilderSlice';

// URL param keys
const PARAM_EXPLORE = 'explore';
const PARAM_TIMESTAMP = 'timestamp';
const PARAM_USER_ID = 'userId';
const PARAM_EVENT_NAME = 'eventName';
const PARAM_BREAKDOWN = 'breakdown';
const PARAM_STEPS = 'steps';
const PARAM_DATE_PRESET = 'datePreset';
const PARAM_DATE_START = 'dateStart';
const PARAM_DATE_END = 'dateEnd';
const PARAM_WINDOW_VALUE = 'windowValue';
const PARAM_WINDOW_UNIT = 'windowUnit';

const VALID_DATE_PRESETS: FunnelDatePreset[] = [
    'last_7_days',
    'last_14_days',
    'last_30_days',
    'last_90_days',
    'custom',
];

const VALID_WINDOW_UNITS = ['hours', 'days', 'weeks'] as const;

/**
 * Hook to sync funnel builder state with URL search params.
 * This enables sharing URLs and preserving state across page refreshes.
 */
export function useFunnelUrlSync() {
    const dispatch = useAppDispatch();
    const [searchParams, setSearchParams] = useSearchParams();
    const isInitialized = useRef(false);
    const isUpdatingFromUrl = useRef(false);

    // Select all state values
    const exploreName = useAppSelector(selectExploreName);
    const timestampFieldId = useAppSelector(selectTimestampFieldId);
    const userIdFieldId = useAppSelector(selectUserIdFieldId);
    const eventNameFieldId = useAppSelector(selectEventNameFieldId);
    const breakdownDimensionId = useAppSelector(selectBreakdownDimensionId);
    const steps = useAppSelector(selectSteps);
    const dateRangePreset = useAppSelector(selectDateRangePreset);
    const customDateRange = useAppSelector(selectCustomDateRange);
    const conversionWindowValue = useAppSelector(selectConversionWindowValue);
    const conversionWindowUnit = useAppSelector(selectConversionWindowUnit);

    // Parse steps from URL param (comma-separated event names)
    const parseSteps = useCallback(
        (stepsParam: string | null): FunnelStep[] => {
            if (!stepsParam) return [{ stepOrder: 1, eventName: '' }];
            try {
                const eventNames = JSON.parse(stepsParam) as string[];
                if (!Array.isArray(eventNames) || eventNames.length === 0) {
                    return [{ stepOrder: 1, eventName: '' }];
                }
                return eventNames.map((name, idx) => ({
                    stepOrder: idx + 1,
                    eventName: name,
                }));
            } catch {
                return [{ stepOrder: 1, eventName: '' }];
            }
        },
        [],
    );

    // Serialize steps to URL param
    const serializeSteps = useCallback(
        (stepsToSerialize: FunnelStep[]): string => {
            const eventNames = stepsToSerialize.map((s) => s.eventName);
            return JSON.stringify(eventNames);
        },
        [],
    );

    // Initialize state from URL on mount
    useEffect(() => {
        if (isInitialized.current) return;
        isInitialized.current = true;

        const urlExploreName = searchParams.get(PARAM_EXPLORE);
        if (!urlExploreName) return; // No URL state to restore

        isUpdatingFromUrl.current = true;

        // Restore explore name first (this doesn't clear other fields when loading from URL)
        dispatch(setExploreName(urlExploreName));

        // Restore field mappings
        const urlTimestamp = searchParams.get(PARAM_TIMESTAMP);
        if (urlTimestamp) dispatch(setTimestampFieldId(urlTimestamp));

        const urlUserId = searchParams.get(PARAM_USER_ID);
        if (urlUserId) dispatch(setUserIdFieldId(urlUserId));

        const urlEventName = searchParams.get(PARAM_EVENT_NAME);
        if (urlEventName) dispatch(setEventNameFieldId(urlEventName));

        const urlBreakdown = searchParams.get(PARAM_BREAKDOWN);
        if (urlBreakdown) dispatch(setBreakdownDimensionId(urlBreakdown));

        // Restore steps
        const urlSteps = searchParams.get(PARAM_STEPS);
        const parsedSteps = parseSteps(urlSteps);
        dispatch(setSteps(parsedSteps));

        // Restore date range
        const urlDatePreset = searchParams.get(
            PARAM_DATE_PRESET,
        ) as FunnelDatePreset | null;
        if (urlDatePreset && VALID_DATE_PRESETS.includes(urlDatePreset)) {
            dispatch(setDateRangePreset(urlDatePreset));
        }

        const urlDateStart = searchParams.get(PARAM_DATE_START);
        const urlDateEnd = searchParams.get(PARAM_DATE_END);
        if (urlDateStart || urlDateEnd) {
            dispatch(setCustomDateRange([urlDateStart, urlDateEnd]));
        }

        // Restore conversion window
        const urlWindowValue = searchParams.get(PARAM_WINDOW_VALUE);
        if (urlWindowValue) {
            const parsed = parseInt(urlWindowValue, 10);
            if (!isNaN(parsed) && parsed > 0) {
                dispatch(setConversionWindowValue(parsed));
            }
        }

        const urlWindowUnit = searchParams.get(PARAM_WINDOW_UNIT) as
            | (typeof VALID_WINDOW_UNITS)[number]
            | null;
        if (urlWindowUnit && VALID_WINDOW_UNITS.includes(urlWindowUnit)) {
            dispatch(setConversionWindowUnit(urlWindowUnit));
        }

        // Allow a tick for state to settle before enabling URL updates
        setTimeout(() => {
            isUpdatingFromUrl.current = false;
        }, 0);
    }, [searchParams, dispatch, parseSteps]);

    // Update URL when state changes
    useEffect(() => {
        // Don't update URL while we're restoring from URL
        if (isUpdatingFromUrl.current) return;
        // Don't update URL until initial load is complete
        if (!isInitialized.current) return;

        const newParams = new URLSearchParams();

        // Only write to URL if we have an explore selected
        if (exploreName) {
            newParams.set(PARAM_EXPLORE, exploreName);

            if (timestampFieldId)
                newParams.set(PARAM_TIMESTAMP, timestampFieldId);
            if (userIdFieldId) newParams.set(PARAM_USER_ID, userIdFieldId);
            if (eventNameFieldId)
                newParams.set(PARAM_EVENT_NAME, eventNameFieldId);
            if (breakdownDimensionId)
                newParams.set(PARAM_BREAKDOWN, breakdownDimensionId);

            // Only write steps if at least one has an event name
            if (steps.some((s) => s.eventName)) {
                newParams.set(PARAM_STEPS, serializeSteps(steps));
            }

            newParams.set(PARAM_DATE_PRESET, dateRangePreset);

            if (dateRangePreset === 'custom') {
                if (customDateRange[0])
                    newParams.set(PARAM_DATE_START, customDateRange[0]);
                if (customDateRange[1])
                    newParams.set(PARAM_DATE_END, customDateRange[1]);
            }

            newParams.set(PARAM_WINDOW_VALUE, String(conversionWindowValue));
            newParams.set(PARAM_WINDOW_UNIT, conversionWindowUnit);
        }

        // Use replace to avoid polluting browser history
        setSearchParams(newParams, { replace: true });
    }, [
        exploreName,
        timestampFieldId,
        userIdFieldId,
        eventNameFieldId,
        breakdownDimensionId,
        steps,
        dateRangePreset,
        customDateRange,
        conversionWindowValue,
        conversionWindowUnit,
        serializeSteps,
        setSearchParams,
    ]);
}
