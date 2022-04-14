import { UpdatedByUser } from 'common';
import React, { Dispatch, SetStateAction } from 'react';
import { UpdatedInfo } from '../Home/LatestSavedCharts';
import LinkButton from './LinkButton';
import ModalActionButtons from './modal/ModalActionButtons';

type ActionCardProps<T> = {
    data: T;
    url: string;
    setActionState: Dispatch<SetStateAction<{ actionType: number; data?: T }>>;
};

const ActionCard = <
    T extends {
        uuid: string;
        name: string;
        updatedAt: Date;
        updatedByUser?: UpdatedByUser;
    },
>(
    props: ActionCardProps<T>,
) => {
    const {
        data,
        data: { name },
        url,
        setActionState,
    } = props;
    return (
        <LinkButton
            href={url}
            minimal
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                textAlign: 'left',
            }}
            rightIcon={
                <ModalActionButtons
                    data={data}
                    url={url}
                    setActionState={setActionState}
                />
            }
        >
            <strong>{name}</strong>
            <UpdatedInfo updatedAt={data.updatedAt} user={data.updatedByUser} />
        </LinkButton>
    );
};

export default ActionCard;
