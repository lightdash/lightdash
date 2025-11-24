import { Group, Modal, Text } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { useCallback, type FC, type PropsWithChildren } from 'react';
import {
    explorerActions,
    selectItemDetailModal,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../../features/explorer/store';
import FieldIcon from '../../../common/Filters/FieldIcon';
import MantineIcon from '../../../common/MantineIcon';
import { ItemDetailMarkdown } from './ItemDetailPreview';
import { getFieldIconColor } from './utils';

/**
 * Provider for a shared modal to display details about tree items
 */
export const ItemDetailProvider: FC<PropsWithChildren<{}>> = ({ children }) => {
    const dispatch = useExplorerDispatch();
    const itemDetail = useExplorerSelector(selectItemDetailModal);

    const close = useCallback(() => {
        dispatch(explorerActions.closeItemDetail());
    }, [dispatch]);

    const renderHeader = useCallback(() => {
        if (!itemDetail.itemType || !itemDetail.label) return null;

        switch (itemDetail.itemType) {
            case 'field':
                return (
                    <Group>
                        {itemDetail.fieldItem && (
                            <FieldIcon
                                item={itemDetail.fieldItem}
                                color={getFieldIconColor(itemDetail.fieldItem)}
                                size="md"
                            />
                        )}
                        <Text size="md">{itemDetail.label}</Text>
                    </Group>
                );
            case 'table':
                return (
                    <Group spacing="sm">
                        <MantineIcon
                            icon={IconTable}
                            size="lg"
                            color="ldGray.7"
                        />
                        <Text size="md">{itemDetail.label}</Text>
                    </Group>
                );
            case 'group':
                return (
                    <Group>
                        <Text size="md">{itemDetail.label}</Text>
                    </Group>
                );
            default:
                return null;
        }
    }, [itemDetail.itemType, itemDetail.label, itemDetail.fieldItem]);

    const renderDetail = useCallback(() => {
        if (itemDetail.description) {
            return <ItemDetailMarkdown source={itemDetail.description} />;
        }
        return <Text color="gray">No description available.</Text>;
    }, [itemDetail.description]);

    return (
        <>
            {itemDetail.isOpen && (
                <Modal
                    p="xl"
                    size="lg"
                    opened={itemDetail.isOpen}
                    onClose={close}
                    title={renderHeader()}
                >
                    {renderDetail()}
                </Modal>
            )}

            {children}
        </>
    );
};
