import { Box } from '@mantine-8/core';
import { memo, useMemo } from 'react';
import { useParams } from 'react-router';
import {
    ParameterSelection,
    useParameters,
} from '../../../features/parameters';
import { useExplore } from '../../../hooks/useExplore';
import { ExplorerSection } from '../../../providers/Explorer/types';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';

const ParametersCard = memo(
    ({ parameterReferences }: { parameterReferences?: string[] }) => {
        const { projectUuid } = useParams<{ projectUuid: string }>();
        const expandedSections = useExplorerContext(
            (context) => context.state.expandedSections,
        );

        const isEditMode = useExplorerContext(
            (context) => context.state.isEditMode,
        );

        const tableName = useExplorerContext(
            (context) => context.state.unsavedChartVersion.tableName,
        );

        const toggleExpandedSection = useExplorerContext(
            (context) => context.actions.toggleExpandedSection,
        );

        const {
            data: projectParameters,
            isLoading: isProjectParametersLoading,
            isError: isProjectParametersError,
            isFetched: isProjectParametersFetched,
        } = useParameters(projectUuid, parameterReferences, {
            enabled: !!projectUuid && !!parameterReferences?.length,
        });

        const {
            data: explore,
            isLoading: isExploreLoading,
            isError: isExploreError,
            isFetched: isExploreFetched,
        } = useExplore(tableName);

        const parameters = useMemo(() => {
            // Project parameters are already filtered by the parameterReferences
            // so we only need to filter the explore parameters
            const filteredExploreParameters = Object.fromEntries(
                Object.entries(explore?.parameters ?? {}).filter(([key]) =>
                    parameterReferences?.includes(key),
                ),
            );

            return {
                ...projectParameters,
                ...filteredExploreParameters,
            };
        }, [projectParameters, explore?.parameters, parameterReferences]);

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
            value: string | string[] | null,
        ) => {
            setParameter(paramKey, value);
        };

        const paramsIsOpen = expandedSections.includes(
            ExplorerSection.PARAMETERS,
        );

        const missingRequiredParameters = useExplorerContext(
            (context) => context.state.missingRequiredParameters,
        );

        return (
            <CollapsableCard
                isOpen={
                    paramsIsOpen &&
                    isProjectParametersFetched &&
                    isExploreFetched
                }
                title="Parameters"
                disabled={!tableName}
                toggleTooltip={!tableName ? 'No model selected' : ''}
                onToggle={() =>
                    toggleExpandedSection(ExplorerSection.PARAMETERS)
                }
            >
                <Box m="md">
                    <ParameterSelection
                        parameters={parameters}
                        missingRequiredParameters={missingRequiredParameters}
                        isLoading={
                            isProjectParametersLoading || isExploreLoading
                        }
                        isError={isProjectParametersError || isExploreError}
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
