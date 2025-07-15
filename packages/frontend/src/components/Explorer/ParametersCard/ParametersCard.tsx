import { Text } from '@mantine/core';
import { memo } from 'react';
import { useParams } from 'react-router';
import { useParameters } from '../../../hooks/parameters/useParameters';
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

        const { data: parameterDetails } = useParameters(projectUuid);

        console.log('parameterDetails', {
            parameterDetails,
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
                <Text>Parameters card content goes here (dummy)</Text>
            </CollapsableCard>
        );
    },
);

export default ParametersCard;
