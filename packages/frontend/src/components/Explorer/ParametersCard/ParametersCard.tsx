import { Box } from '@mantine/core';
import { memo, useEffect } from 'react';
import { useParams } from 'react-router';
import {
    ParameterSelection,
    useParameters,
} from '../../../features/parameters';
import { ExplorerSection } from '../../../providers/Explorer/types';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';

const ParametersCard = memo(
    ({ parameterReferences }: { parameterReferences: string[] }) => {
        const { projectUuid } = useParams<{ projectUuid: string }>();
        const expandedSections = useExplorerContext(
            (context) => context.state.expandedSections,
        );

        const tableName = useExplorerContext(
            (context) => context.state.unsavedChartVersion.tableName,
        );

        const toggleExpandedSection = useExplorerContext(
            (context) => context.actions.toggleExpandedSection,
        );

        const {
            data: parameters,
            isLoading,
            isError,
        } = useParameters(projectUuid, parameterReferences);

        const parameterValues = useExplorerContext(
            (context) => context.state.parameters,
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

        // Apply defaults
        useEffect(() => {
            if (parameters) {
                Object.entries(parameters).forEach(([key, param]) => {
                    if (
                        param.default &&
                        (!parameterValues || !parameterValues[key])
                    ) {
                        setParameter(key, param.default);
                    }
                });
            }
        }, [parameterValues, parameters, setParameter]);

        const paramsIsOpen = expandedSections.includes(
            ExplorerSection.PARAMETERS,
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
                        parameters={parameters}
                        isLoading={isLoading}
                        isError={isError}
                        parameterValues={parameterValues || {}}
                        onParameterChange={handleParameterChange}
                        size="sm"
                        showClearAll={true}
                        onClearAll={clearAllParameters}
                        cols={2}
                        projectUuid={projectUuid}
                    />
                </Box>
            </CollapsableCard>
        );
    },
);

export default ParametersCard;
