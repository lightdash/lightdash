import { Button, Menu, MenuItem } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { Dashboard as IDashboard } from 'common';
import React, { Dispatch, SetStateAction, useCallback, useState } from 'react';
import {
    useDuplicateMutation,
    useSavedQuery,
} from '../../../hooks/useSavedQuery';
import { ActionTypeModal } from './ActionModal';

type ModalActionButtonsProps = {
    data: any;
    url: string;
    setActionState: Dispatch<
        SetStateAction<{ actionType: number; data?: any }>
    >;
};

const ModalActionButtons = ({
    data,
    url,
    setActionState,
}: ModalActionButtonsProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [tileId, setTileId] = useState<string>('');
    const { data: chartToDuplicate } = useSavedQuery({ id: tileId });

    const { mutate: duplicateChart } = useDuplicateMutation(tileId);

    const onDuplicate = useCallback(
        (tile: IDashboard['tiles'][number]) => {
            // @ts-ignore
            setTileId(tile.properties && tile.properties.savedChartUuid);

            if (chartToDuplicate) {
                const {
                    projectUuid: idToForget,
                    uuid,
                    updatedAt,
                    ...chartDuplicate
                } = chartToDuplicate;
                duplicateChart({
                    ...chartDuplicate,
                    name: `${chartDuplicate.name} (copy)`,
                });
            }
        },
        [chartToDuplicate],
    );

    return (
        <Popover2
            isOpen={isOpen}
            onClose={() => {
                setIsOpen(false);
            }}
            content={
                <Menu>
                    <MenuItem
                        role="button"
                        icon="edit"
                        text="Rename"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsOpen(false);
                            setActionState({
                                actionType: ActionTypeModal.UPDATE,
                                data,
                            });
                        }}
                    />
                    <MenuItem
                        role="button"
                        icon="duplicate"
                        text="Duplicate"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('miraaa', e);
                            // onDuplicate(e);
                            setActionState({
                                actionType: ActionTypeModal.DUPLICATE,
                                data,
                            });
                        }}
                    />
                    <MenuItem
                        role="button"
                        icon="delete"
                        text="Delete"
                        intent="danger"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsOpen(false);
                            setActionState({
                                actionType: ActionTypeModal.DELETE,
                                data,
                            });
                        }}
                    />
                </Menu>
            }
            placement="bottom"
        >
            <Button
                icon="more"
                minimal
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(true);
                }}
            />
        </Popover2>
    );
};

export default ModalActionButtons;
