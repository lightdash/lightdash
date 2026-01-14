import {
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import { Group, Skeleton } from '@mantine-8/core';
import { useCallback, useMemo, useState, type FC, type ReactNode } from 'react';
import { useParams } from 'react-router';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import Parameter from './Parameter';

type Props = {
    isEditMode: boolean;
    parameterValues: ParametersValuesMap;
    onParameterChange: (key: string, value: ParameterValue | null) => void;
    onClearAll: () => void;
    parameters?: ParameterDefinitions;
    missingRequiredParameters?: string[];
    pinnedParameters?: string[];
    onParameterPin?: (paramKey: string) => void;
    isLoading?: boolean;
    isError?: boolean;
    /** Separator element to render with the first parameter (so they wrap together) */
    separator?: ReactNode;
    /** Active tab UUID for filtering parameters by tab context */
    activeTabUuid?: string;
};

export const Parameters: FC<Props> = ({
    isEditMode,
    parameterValues,
    onParameterChange,
    parameters,
    isLoading,
    missingRequiredParameters = [],
    separator,
    activeTabUuid,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [openPopoverId, setOpenPopoverId] = useState<string | undefined>();

    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );

    const handlePopoverOpen = useCallback((popoverId: string) => {
        setOpenPopoverId(popoverId);
    }, []);

    const handlePopoverClose = useCallback(() => {
        setOpenPopoverId(undefined);
    }, []);

    const getTabsForParameter = useCallback(
        (paramKey: string): string[] => {
            if (!dashboardTiles) return [];
            const tabs: string[] = [];
            for (const tile of dashboardTiles) {
                const tileParams = tileParameterReferences[tile.uuid] || [];
                if (tileParams.includes(paramKey)) {
                    // Tile has no tabUuid = applies to all tabs (backwards compat)
                    if (!tile.tabUuid) {
                        return []; // Empty array signals "applies everywhere"
                    }
                    tabs.push(tile.tabUuid);
                }
            }
            return [...new Set(tabs)];
        },
        [dashboardTiles, tileParameterReferences],
    );

    const visibleParamEntries = useMemo(() => {
        if (!parameters) return [];
        return Object.entries(parameters).filter(([paramKey]) => {
            const appliesToTabs = getTabsForParameter(paramKey);
            // Empty appliesToTabs = applies to all tabs OR no tabs loaded
            // !activeTabUuid = no active tab (single tab mode) = show all
            const appliedToCurrentTab =
                !activeTabUuid ||
                appliesToTabs.length === 0 ||
                appliesToTabs.includes(activeTabUuid);
            return appliedToCurrentTab;
        });
    }, [parameters, getTabsForParameter, activeTabUuid]);

    if (!parameters || Object.keys(parameters).length === 0) {
        return null;
    }

    if (isLoading) {
        return (
            <Group gap="xs">
                {separator}
                <Skeleton h={30} w={120} radius={100} />
                <Skeleton h={30} w={120} radius={100} />
            </Group>
        );
    }

    if (visibleParamEntries.length === 0) {
        return null;
    }

    return (
        <>
            {visibleParamEntries.map(([paramKey, parameter], index) => {
                const paramComponent = (
                    <Parameter
                        key={paramKey}
                        paramKey={paramKey}
                        parameter={parameter}
                        value={parameterValues[paramKey] ?? null}
                        parameterValues={parameterValues}
                        openPopoverId={openPopoverId}
                        onPopoverOpen={handlePopoverOpen}
                        onPopoverClose={handlePopoverClose}
                        onParameterChange={onParameterChange}
                        projectUuid={projectUuid}
                        isRequired={missingRequiredParameters.includes(
                            paramKey,
                        )}
                        isEditMode={isEditMode}
                    />
                );

                // Group separator with first parameter so they wrap together
                if (index === 0 && separator) {
                    return (
                        <Group key={paramKey} gap="xs" wrap="nowrap">
                            {separator}
                            {paramComponent}
                        </Group>
                    );
                }

                return paramComponent;
            })}
        </>
    );
};
