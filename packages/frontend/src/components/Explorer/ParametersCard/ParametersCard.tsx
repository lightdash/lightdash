import { Box } from '@mantine-8/core';
import { memo, useCallback, useMemo } from 'react';
import { useParams } from 'react-router';
import {
    explorerActions,
    selectIsEditMode,
    selectIsParametersExpanded,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { ParameterSelection } from '../../../features/parameters';
import { ExplorerSection } from '../../../providers/Explorer/types';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';

const ParametersCard = memo(
    ({ parameterReferences }: { parameterReferences?: string[] }) => {
        const { projectUuid } = useParams<{ projectUuid: string }>();

        // Redux selectors for performance - using component-specific selector
        const paramsIsOpen = useExplorerSelector(selectIsParametersExpanded);
        const isEditMode = useExplorerSelector(selectIsEditMode);
        const dispatch = useExplorerDispatch();

        const tableName = useExplorerContext(
            (context) => context.state.unsavedChartVersion.tableName,
        );

        // TODO: Migration - dispatching directly to Redux for isolated re-renders
        const toggleExpandedSection = useCallback(
            (section: ExplorerSection) => {
                dispatch(explorerActions.toggleExpandedSection(section));
            },
            [dispatch],
        );

        const parameterDefinitions = useExplorerContext(
            (context) => context.state.parameterDefinitions,
        );

        const filteredParameterDefinitions = useMemo(() => {
            return Object.fromEntries(
                Object.entries(parameterDefinitions).filter(([key]) =>
                    parameterReferences?.includes(key),
                ),
            );
        }, [parameterDefinitions, parameterReferences]);

        const parameterValues = useExplorerContext(
            (context) => context.state.unsavedChartVersion.parameters || {},
        );

        const setParameter = useExplorerContext(
            (context) => context.actions.setParameter,
        );

        const clearAllParameters = useExplorerContext(
            (context) => context.actions.clearAllParameters,
        );

        const handleParameterChange = (
            paramKey: string,
            value: string | number | string[] | number[] | null,
        ) => {
            setParameter(paramKey, value);
        };

        // paramsIsOpen now comes directly from Redux selector above

        const missingRequiredParameters = useExplorerContext(
            (context) => context.state.missingRequiredParameters,
        );

        return (
            <CollapsableCard
                isOpen={paramsIsOpen}
                title="Parameters"
                disabled={!tableName}
                toggleTooltip={!tableName ? 'No model selected' : ''}
                onToggle={() =>
                    toggleExpandedSection(ExplorerSection.PARAMETERS)
                }
            >
                <Box m="md">
                    <ParameterSelection
                        parameters={filteredParameterDefinitions}
                        missingRequiredParameters={missingRequiredParameters}
                        parameterValues={parameterValues || {}}
                        onParameterChange={handleParameterChange}
                        showClearAll={true}
                        onClearAll={clearAllParameters}
                        cols={2}
                        projectUuid={projectUuid}
                        disabled={!isEditMode}
                    />
                </Box>
            </CollapsableCard>
        );
    },
);

export default ParametersCard;
