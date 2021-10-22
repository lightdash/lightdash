import React, { Dispatch, SetStateAction } from 'react';
import ModalActionButtons from './modal/ModalActionButtons';

type ActionCardProps<T> = {
    data: T;
    url: string;
    setActionState: Dispatch<SetStateAction<{ actionType: number; data?: T }>>;
};

const ActionCard = <T extends { uuid: string; name: string }>(
    props: ActionCardProps<T>,
) => {
    const {
        data,
        data: { name },
        url,
        setActionState,
    } = props;
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}
        >
            <a style={{ color: 'inherit' }} href={url}>
                <strong>{name}</strong>
            </a>
            <ModalActionButtons
                data={data}
                url={url}
                setActionState={setActionState}
            />
        </div>
    );
};

export default ActionCard;
