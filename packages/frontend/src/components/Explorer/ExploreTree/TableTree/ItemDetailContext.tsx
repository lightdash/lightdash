import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    createContext,
    FC,
    PropsWithChildren,
    useCallback,
    useContext,
    useState,
} from 'react';

interface ItemDetailProps {
    header: JSX.Element;
    detail: JSX.Element;
}

const ItemDetailContext = createContext<{
    showItemDetail: (detail: ItemDetailProps) => void;
} | null>(null);

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
