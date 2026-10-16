import {
    Group,
    Input,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { useCallback, type FC, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import {
    explorerActions,
    selectItemDetailModal,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../../features/explorer/store';
import { getFieldColor } from '../../../../utils/fieldColors';
import { CopyActionIcon } from '../../../common/CopyActionIcon';
import FieldIcon from '../../../common/Filters/FieldIcon';
import MantineIcon from '../../../common/MantineIcon';
import MantineModal from '../../../common/MantineModal';
import { ItemDetailMarkdown } from './ItemDetailPreview';

const CopyableInput: FC<{ label: string; value: string }> = ({
    label,
    value,
}) => {
    const { t } = useTranslation('explorer');
    return (
        <TextInput
            label={label}
            value={value}
            readOnly
            size="xs"
            onFocus={(e) => e.currentTarget.select()}
            rightSection={
                <CopyActionIcon
                    value={value}
                    tooltipPosition="left"
                    size="xs"
                    aria-label={t('itemDetail.copyValue', { label })}
                />
            }
        />
    );
};

/**
 * Provider for a shared modal to display details about tree items
 */
export const ItemDetailProvider: FC<PropsWithChildren<{}>> = ({ children }) => {
    const { t } = useTranslation('explorer');
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
                                color={getFieldColor(itemDetail.fieldItem)}
                                size="md"
                            />
                        )}
                        <Text fz="md">{itemDetail.label}</Text>
                    </Group>
                );
            case 'table':
                return (
                    <Group gap="sm">
                        <MantineIcon
                            icon={IconTable}
                            size="lg"
                            color="ldGray.7"
                        />
                        <Text fz="md">{itemDetail.label}</Text>
                    </Group>
                );
            case 'group':
                return (
                    <Group>
                        <Text fz="md">{itemDetail.label}</Text>
                    </Group>
                );
            default:
                return null;
        }
    }, [itemDetail.itemType, itemDetail.label, itemDetail.fieldItem]);

    const renderDetail = useCallback(() => {
        const metadata = itemDetail.tableMetadata;
        if (itemDetail.itemType === 'table' && metadata) {
            return (
                <Stack gap="xs">
                    <SimpleGrid cols={2} spacing="xs">
                        <CopyableInput
                            label={t('itemDetail.modelName')}
                            value={metadata.name}
                        />
                        {metadata.dbtPackageName && (
                            <CopyableInput
                                label={t('itemDetail.dbtPackage')}
                                value={metadata.dbtPackageName}
                            />
                        )}
                    </SimpleGrid>
                    {(metadata.ymlPath || metadata.sqlPath) && (
                        <SimpleGrid cols={2} spacing="xs">
                            {metadata.ymlPath && (
                                <CopyableInput
                                    label={t('itemDetail.yamlFile')}
                                    value={metadata.ymlPath}
                                />
                            )}
                            {metadata.sqlPath && (
                                <CopyableInput
                                    label={t('itemDetail.sqlFile')}
                                    value={metadata.sqlPath}
                                />
                            )}
                        </SimpleGrid>
                    )}
                    {itemDetail.description && (
                        <Input.Wrapper
                            label={t('itemDetail.description')}
                            size="xs"
                            w="100%"
                            miw={0}
                        >
                            <Paper
                                p="md"
                                radius="md"
                                bg="white"
                                bd="1px solid ldGray.2"
                                w="100%"
                                miw={0}
                            >
                                <ItemDetailMarkdown
                                    source={itemDetail.description}
                                />
                            </Paper>
                        </Input.Wrapper>
                    )}
                </Stack>
            );
        }
        if (itemDetail.description) {
            return <ItemDetailMarkdown source={itemDetail.description} />;
        }
        return <Text c="gray">{t('itemDetail.noDescription')}</Text>;
    }, [
        itemDetail.description,
        itemDetail.itemType,
        itemDetail.tableMetadata,
        t,
    ]);

    return (
        <>
            {itemDetail.isOpen && (
                <MantineModal
                    opened={itemDetail.isOpen}
                    onClose={close}
                    title={renderHeader()}
                    size={
                        itemDetail.itemType === 'table' &&
                        itemDetail.tableMetadata
                            ? 'xl'
                            : 'lg'
                    }
                    cancelLabel={false}
                >
                    {renderDetail()}
                </MantineModal>
            )}

            {children}
        </>
    );
};
