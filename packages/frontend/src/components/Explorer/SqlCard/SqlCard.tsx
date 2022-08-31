import { Button, Collapse, H5 } from '@blueprintjs/core';
import { FC, memo } from 'react';
import {
    ExplorerSection,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import { RenderedSql } from '../../RenderedSql';
import { CardHeader, StyledCard } from './SqlCard.styles';

const SqlCard: FC = memo(() => {
    const expandedSections = useExplorerContext(
        (context) => context.state.expandedSections,
    );
    const unsavedChartVersionTableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const toggleExpandedSection = useExplorerContext(
        (context) => context.actions.toggleExpandedSection,
    );
    const sqlIsOpen = expandedSections.includes(ExplorerSection.SQL);
    return (
        <StyledCard isOpen={sqlIsOpen} elevation={1}>
            <CardHeader>
                <Button
                    icon={sqlIsOpen ? 'chevron-down' : 'chevron-right'}
                    minimal
                    onClick={() => toggleExpandedSection(ExplorerSection.SQL)}
                    disabled={!unsavedChartVersionTableName}
                />
                <H5>SQL</H5>
            </CardHeader>
            <Collapse isOpen={sqlIsOpen}>
                <RenderedSql />
            </Collapse>
        </StyledCard>
    );
});

export default SqlCard;
