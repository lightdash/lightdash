import React, { FC, useState } from 'react';
import { Dashboard } from 'common';
import { Icon, H5 } from '@blueprintjs/core';
import styled from 'styled-components';
import AddTileModal from './AddTileModal';

const Wrapper = styled.div`
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;

    &:hover {
        background: rgba(138, 155, 168, 0.15);
    }
`;

type Props = {
    dashboard: Dashboard;
};

const AddTileButton: FC<Props> = ({ dashboard }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <>
            <Wrapper role="button" tabIndex={0} onClick={() => setIsOpen(true)}>
                <Icon icon="plus" iconSize={50} />
                <H5 style={{ margin: 0 }}>Add chart</H5>
            </Wrapper>
            {isOpen && (
                <AddTileModal
                    dashboard={dashboard}
                    onClose={() => setIsOpen(false)}
                />
            )}
        </>
    );
};

export default AddTileButton;
