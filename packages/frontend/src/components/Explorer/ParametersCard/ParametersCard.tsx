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
            data: parameters,
            isLoading,
            isError,
            isFetched,
        } = useParameters(projectUuid, parameterReferences, {
            enabled: !!parameterReferences?.length,
        });

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

        return (
            <CollapsableCard
                isOpen={paramsIsOpen && isFetched}
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
                        disabled={!isEditMode}
                    />
                </Box>
            </CollapsableCard>
        );
    },
);

export default ParametersCard;
