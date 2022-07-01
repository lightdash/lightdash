import { Button, Collapse, H5 } from '@blueprintjs/core';
import { FC } from 'react';
import {
    ExplorerSection,
    useExplorer,
} from '../../../providers/ExplorerProvider';
import { RenderedSql } from '../../RenderedSql';
import { CardHeader, StyledCard } from './SqlCard.styles';

const SqlCard: FC = () => {
    const {
        state: { expandedSections, unsavedChartVersion },
        actions: { toggleExpandedSection },
    } = useExplorer();
    const sqlIsOpen = expandedSections.includes(ExplorerSection.SQL);
    return (
        <StyledCard isOpen={sqlIsOpen} elevation={1}>
            <CardHeader>
                <Button
                    icon={sqlIsOpen ? 'chevron-down' : 'chevron-right'}
                    minimal
                    onClick={() => toggleExpandedSection(ExplorerSection.SQL)}
                    disabled={!unsavedChartVersion.tableName}
                />
                <H5>SQL</H5>
            </CardHeader>
            <Collapse isOpen={sqlIsOpen}>
                <RenderedSql />
            </Collapse>
        </StyledCard>
    );
};

export default SqlCard;
