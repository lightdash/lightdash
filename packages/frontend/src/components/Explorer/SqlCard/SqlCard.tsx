import { Button, Collapse, H5 } from '@blueprintjs/core';
import { FC, useState } from 'react';
import { RenderedSql } from '../../RenderedSql';
import { CardHeader, StyledCard } from './SqlCard.styles';

const SqlCard: FC = () => {
    const [sqlIsOpen, setSqlIsOpen] = useState<boolean>(false);
    return (
        <StyledCard isOpen={sqlIsOpen} elevation={1}>
            <CardHeader>
                <Button
                    icon={sqlIsOpen ? 'chevron-down' : 'chevron-right'}
                    minimal
                    onClick={() => setSqlIsOpen((f) => !f)}
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
