import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    createContext,
    useCallback,
    useContext,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';

/**
 * These map directly to the modal's title and body:
 */
interface ItemDetailProps {
    header: JSX.Element;
    detail: JSX.Element;
}

const ItemDetailContext = createContext<{
    showItemDetail: (detail: ItemDetailProps) => void;
    isItemDetailOpen: boolean;
} | null>(null);

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

export const useItemDetail = () => {
    const ctx = useContext(ItemDetailContext);

    if (ctx == null) {
        throw new Error('useItemDetail must be used within ItemDetailProvider');
    }

    return ctx;
};
