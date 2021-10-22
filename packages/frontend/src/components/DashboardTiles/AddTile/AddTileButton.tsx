import React, { FC, useState } from 'react';
import { DashboardChartTile } from 'common';
import { Button } from '@blueprintjs/core';
import styled from 'styled-components';
import AddTileModal from './AddTileModal';

const Wrapper = styled.div`
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-left: 10px;
`;

type Props = {
    onAddTile: (tile: DashboardChartTile) => void;
};

const AddTileButton: FC<Props> = ({ onAddTile }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <>
            <Wrapper>
                <Button text="Add chart" onClick={() => setIsOpen(true)} />
            </Wrapper>
            {isOpen && (
                <AddTileModal
                    onClose={() => setIsOpen(false)}
                    onAddTile={onAddTile}
                />
            )}
        </>
    );
};

export default AddTileButton;
