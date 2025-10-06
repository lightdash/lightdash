import { Modal } from '@mantine/core';
import { useCallback, type FC, type PropsWithChildren } from 'react';
import {
    explorerActions,
    selectItemDetailModal,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../../features/explorer/store';
import { ItemDetailContext } from './ItemDetailContext';
import { type ItemDetailProps } from './types';

/**
 * Exposes the necessary context for a shared modal to display details about
 * a tree item - primarily its description.
 */
export const ItemDetailProvider: FC<PropsWithChildren<{}>> = ({ children }) => {
    const dispatch = useExplorerDispatch();
    const itemDetail = useExplorerSelector(selectItemDetailModal);

    const showItemDetail = useCallback(
        (newItemDetail: ItemDetailProps) => {
            dispatch(
                explorerActions.openItemDetail({
                    header: newItemDetail.header,
                    detail: newItemDetail.detail,
                }),
            );
        },
        [dispatch],
    );

    const close = useCallback(() => {
        dispatch(explorerActions.closeItemDetail());
    }, [dispatch]);

    return (
        <ItemDetailContext.Provider
            value={{
                showItemDetail,
                isItemDetailOpen: itemDetail.isOpen,
            }}
        >
            {itemDetail.isOpen && itemDetail.header && itemDetail.detail && (
                <Modal
                    p="xl"
                    size="lg"
                    opened={itemDetail.isOpen}
                    onClose={close}
                    title={itemDetail.header}
                >
                    {itemDetail.detail}
                </Modal>
            )}

            {children}
        </ItemDetailContext.Provider>
    );
};
