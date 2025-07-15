import { Box } from '@mantine/core';
import { memo } from 'react';
import { useParams } from 'react-router';
import {
    ParameterSelection,
    useParameters,
    useParameterState,
} from '../../../features/parameters';
import { ExplorerSection } from '../../../providers/Explorer/types';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';

const ParametersCard = memo(
    ({
        activeParameterReferences,
    }: {
        activeParameterReferences: string[];
    }) => {
        const { projectUuid } = useParams<{ projectUuid: string }>();
        const expandedSections = useExplorerContext(
            (context) => context.state.expandedSections,
        );

        const tableName = useExplorerContext(
            (context) => context.state.unsavedChartVersion.tableName,
        );

        // const { data } = useExplore(tableName);

        const toggleExpandedSection = useExplorerContext(
            (context) => context.actions.toggleExpandedSection,
        );

        const {
            data: parameters,
            isLoading,
            isError,
        } = useParameters(projectUuid);

        const { parameterValues, handleParameterChange, clearAllParameters } =
            useParameterState();

        console.log('parameterDetails', {
            activeParameterReferences,
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
                        parameterValues={parameterValues}
                        onParameterChange={handleParameterChange}
                        size="sm"
                        showClearAll={true}
                        onClearAll={clearAllParameters}
                        cols={2}
                    />
                </Box>
            </CollapsableCard>
        );
    },
);

export default ParametersCard;
