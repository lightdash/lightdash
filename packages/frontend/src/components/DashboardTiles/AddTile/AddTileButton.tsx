import { Button } from '@blueprintjs/core';
import { DashboardChartTile } from 'common';
import React, { FC, useState } from 'react';
import AddTileModal from './AddTileModal';

type Props = {
    onAddTile: (tile: DashboardChartTile) => void;
};

const AddTileButton: FC<Props> = ({ onAddTile }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <>
            <Button
                style={{ marginLeft: '10px' }}
                text="Add chart"
                onClick={() => setIsOpen(true)}
            />
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
