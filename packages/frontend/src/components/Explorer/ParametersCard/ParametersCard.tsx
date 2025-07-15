import { Badge, Text, Tooltip } from '@mantine/core';
import { memo } from 'react';
import { useParams } from 'react-router';
import { useExplore } from '../../../hooks/useExplore';
import { useProject } from '../../../hooks/useProject';
import { ExplorerSection } from '../../../providers/Explorer/types';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';

const ParametersCard = memo(() => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    // const project = useProject(projectUuid);
    const expandedSections = useExplorerContext(
        (context) => context.state.expandedSections,
    );
    // const isEditMode = useExplorerContext(
    //     (context) => context.state.isEditMode,
    // );
    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );

    const { data } = useExplore(tableName);

    console.log('table ----------------', data);

    const toggleExpandedSection = useExplorerContext(
        (context) => context.actions.toggleExpandedSection,
    );

    const exploreState = useExplorerContext((context) => context.state);
    console.log('exploreState----------------', exploreState);

    const paramsIsOpen = expandedSections.includes(ExplorerSection.PARAMETERS);

    return (
        <CollapsableCard
            isOpen={paramsIsOpen}
            title="Parameters"
            disabled={!tableName}
            toggleTooltip={!tableName ? 'No model selected' : ''}
            onToggle={() => toggleExpandedSection(ExplorerSection.PARAMETERS)}
        >
            <Text>Parameters card content goes here (dummy)</Text>
        </CollapsableCard>
    );
});

export default ParametersCard;
