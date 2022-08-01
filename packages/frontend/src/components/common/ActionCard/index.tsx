import { Button, Colors } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { SessionUser, UpdatedByUser } from '@lightdash/common';
import React, { Dispatch, FC, SetStateAction } from 'react';
import styled from 'styled-components';
import { useSavedQuery } from '../../../hooks/useSavedQuery';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import LinkButton from '../LinkButton';
import ModalActionButtons from '../modal/ModalActionButtons';
import { RightButtons } from './ActionCard.styles';

type ActionCardProps<T> = {
    data: T;
    url: string;
    setActionState: Dispatch<SetStateAction<{ actionType: number; data?: T }>>;
    isChart?: boolean;
};

export const LinkButtonWrapper = styled(LinkButton)`
    display: flex;
    align-items: center;
    justify-content: space-between;
    text-align: left !important;
    height: 60px;
`;
export const UpdatedLabel = styled.p`
    color: ${Colors.GRAY2};
    font-size: 12px;
    font-weight: 400;
    margin-top: 0.38em;
    line-height: 14px;
    margin-bottom: 0;
`;

export const UpdatedInfo: FC<{
    updatedAt: Date;
    user: Partial<SessionUser> | undefined;
}> = ({ updatedAt, user }) => {
    const timeAgo = useTimeAgo(updatedAt);

    return (
        <UpdatedLabel>
            Last edited <b>{timeAgo}</b>{' '}
            {user && user.firstName ? (
                <>
                    by{' '}
                    <b>
                        {user.firstName} {user.lastName}
                    </b>
                </>
            ) : (
                ''
            )}
        </UpdatedLabel>
    );
};

const ActionCard = <
    T extends {
        uuid: string;
        name: string;
        updatedAt: Date;
        updatedByUser?: UpdatedByUser;
        spaceUuid?: string;
    },
>(
    props: ActionCardProps<T>,
) => {
    const {
        data,
        data: { name },
        url,
        setActionState,
        isChart,
    } = props;
    const { data: savedChart } = useSavedQuery({
        id: isChart ? data.uuid : '',
    });

    return (
        <LinkButtonWrapper
            href={url}
            minimal
            rightIcon={
                <RightButtons>
                    {savedChart?.description && (
                        <Tooltip2
                            content={savedChart.description}
                            position="bottom"
                        >
                            <Button icon="info-sign" minimal />
                        </Tooltip2>
                    )}
                    <ModalActionButtons
                        data={data}
                        url={url}
                        setActionState={setActionState}
                        isChart={isChart}
                    />
                </RightButtons>
            }
        >
            <strong>{name}</strong>
            <UpdatedInfo updatedAt={data.updatedAt} user={data.updatedByUser} />
        </LinkButtonWrapper>
    );
};

export default ActionCard;
