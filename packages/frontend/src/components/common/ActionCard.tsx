import React, { Dispatch, SetStateAction } from 'react';
import { Card, H5 } from '@blueprintjs/core';
import { SpaceQuery } from 'common';
import ModalActionButtons from './modal/ModalActionButtons';

type ActionCardProps = {
    data: Pick<SpaceQuery, 'uuid' | 'name'>;
    url: string;
    setActionState: Dispatch<
        SetStateAction<{ actionType: number; data?: any }>
    >;
};

const ActionCard = (props: ActionCardProps) => {
    const {
        data,
        data: { name },
        url,
        setActionState,
    } = props;
    return (
        <Card
            elevation={0}
            style={{
                display: 'flex',
                flexDirection: 'column',
                marginBottom: '20px',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                }}
            >
                <H5 style={{ margin: 0, flex: 1 }}>{name}</H5>
                <ModalActionButtons
                    data={data}
                    url={url}
                    setActionState={setActionState}
                />
            </div>
        </Card>
    );
};

export default ActionCard;
