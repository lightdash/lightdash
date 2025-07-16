import { Box } from '@mantine/core';
import { memo } from 'react';
import { useParams } from 'react-router';
import {
    ParameterSelection,
    useParameters,
} from '../../../features/parameters';
import { ExplorerSection } from '../../../providers/Explorer/types';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';

const ParametersCard = memo(
    ({}: // activeParameterReferences,
    {
        activeParameterReferences: string[];
    }) => {
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
        } = useParameters(projectUuid);

        const parameterValues = useExplorerContext(
            (context) => context.state.parameters,
        );

        const setParameter = useExplorerContext(
            (context) => context.actions.setParameter,
        );

        const handleParameterChange = (
            paramKey: string,
            value: string | null,
        ) => {
            if (!value) {
                return;
            }
            setParameter(paramKey, value);
        };

        console.log('parameterDetails', {
            parameters,
            parameterValues,
        });

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
                        onClearAll={() => {
                            console.log('clear all');
                        }}
                        cols={2}
                    />
                </Box>
            </CollapsableCard>
        );
    },
);

export default ParametersCard;
