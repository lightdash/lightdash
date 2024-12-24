import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useCallback, useState, type FC, type PropsWithChildren } from 'react';
import { ItemDetailContext } from './ItemDetailContext';
import { type ItemDetailProps } from './types';

/**
 * Exposes the necessary context for a shared modal to display details about
 * a tree item - primarily its description.
 */
export const ItemDetailProvider: FC<PropsWithChildren<{}>> = ({ children }) => {
    const [itemDetail, setItemDetail] = useState<ItemDetailProps>();
    const [opened, { open, close }] = useDisclosure();

    const showItemDetail = useCallback(
        (newItemDetail: ItemDetailProps) => {
            setItemDetail(newItemDetail);
            open();
        },
        [setItemDetail, open],
    );

    return (
        <ItemDetailContext.Provider
            value={{
                showItemDetail,
                isItemDetailOpen: opened,
            }}
        >
            {itemDetail && opened && (
                <Modal
                    p="xl"
                    size="lg"
                    opened={opened}
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
