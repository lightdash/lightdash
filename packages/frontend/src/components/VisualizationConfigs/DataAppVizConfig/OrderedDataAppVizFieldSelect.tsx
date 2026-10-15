import {
    getItemId,
    getItemLabelWithoutTableName,
    type Item,
} from '@lightdash/common';
import { CloseButton, Group, Loader, Stack, Tooltip } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import FieldSelect from '../../common/FieldSelect';
import { AddButton } from '../common/AddButton';

type Props = {
    header: ReactNode;
    label: string;
    items: Item[];
    addItems?: Item[];
    selectedIds: string[];
    addDisabled: boolean;
    addPosition?: 'header' | 'footer';
    emptyPlaceholder?: string;
    describedBy?: string;
    isFieldPending?: (id: string) => boolean;
    onAddToQuery?: (item: Item) => void;
    onChange: (ids: string[]) => void;
};

/** An ordered, unique binding rendered like the chart configuration field lists. */
const OrderedDataAppVizFieldSelect: FC<Props> = ({
    header,
    label,
    items,
    addItems,
    selectedIds,
    addDisabled,
    addPosition = 'header',
    emptyPlaceholder,
    describedBy,
    isFieldPending,
    onAddToQuery,
    onChange,
}) => {
    const { t } = useTranslation('vizConfig');
    const allItems = [...items, ...(addItems ?? [])];
    const hasAvailableItem = allItems.some(
        (item) => !selectedIds.includes(getItemId(item)),
    );

    const add = () => {
        const next = allItems.find(
            (item) => !selectedIds.includes(getItemId(item)),
        );
        if (!next) return;
        const id = getItemId(next);
        if (!items.some((item) => getItemId(item) === id)) {
            onAddToQuery?.(next);
        }
        onChange([...selectedIds, id]);
    };

    const addButton = (
        <AddButton
            aria-label={t('dataAppViz.fieldSelect.addItem', {
                label: label.toLowerCase(),
            })}
            disabled={addDisabled || !hasAvailableItem}
            onClick={add}
        />
    );

    const replace = (index: number, item: Item | undefined) => {
        const currentId = selectedIds[index];
        if (!item) {
            onChange(selectedIds.filter((id) => id !== currentId));
            return;
        }
        const id = getItemId(item);
        if (id === currentId || selectedIds.includes(id)) return;
        if (!items.some((candidate) => getItemId(candidate) === id)) {
            onAddToQuery?.(item);
        }
        const next = [...selectedIds];
        next[index] = id;
        onChange(next);
    };

    return (
        <Stack gap="xs">
            {(header !== null || addPosition === 'header') && (
                <Group justify="space-between" gap="xs" wrap="nowrap">
                    {header}
                    {addPosition === 'header' && addButton}
                </Group>
            )}
            {selectedIds.length === 0 && addDisabled && (
                <FieldSelect
                    size="xs"
                    disabled
                    placeholder={
                        emptyPlaceholder ??
                        t('dataAppViz.fieldSelect.noFieldsAvailable')
                    }
                    items={[]}
                    onChange={() => {}}
                />
            )}
            {selectedIds.flatMap((id, index) => {
                const item = allItems.find(
                    (candidate) => getItemId(candidate) === id,
                );
                if (!item) return [];
                const itemLabel = getItemLabelWithoutTableName(item);
                return [
                    <FieldSelect
                        key={id}
                        size="xs"
                        aria-label={t('dataAppViz.fieldSelect.itemAriaLabel', {
                            label,
                            item: itemLabel,
                        })}
                        aria-describedby={describedBy}
                        placeholder={t('dataAppViz.fieldSelect.selectItem', {
                            label: label.toLowerCase(),
                        })}
                        item={item}
                        items={items}
                        addItems={addItems}
                        inactiveItemIds={selectedIds.filter(
                            (selectedId) => selectedId !== id,
                        )}
                        onChange={(newItem) => replace(index, newItem)}
                        hasGrouping
                        rightSectionPointerEvents="all"
                        rightSectionWidth={isFieldPending?.(id) ? 48 : 28}
                        rightSection={
                            <Group gap={2} wrap="nowrap">
                                {isFieldPending?.(id) && (
                                    <Tooltip
                                        label={t(
                                            'dataAppViz.fieldSelect.addingFieldToQuery',
                                        )}
                                        openDelay={300}
                                    >
                                        <Loader size="xs" />
                                    </Tooltip>
                                )}
                                <CloseButton
                                    aria-label={t(
                                        'dataAppViz.fieldSelect.removeItem',
                                        { item: itemLabel },
                                    )}
                                    size="xs"
                                    onClick={() => replace(index, undefined)}
                                />
                            </Group>
                        }
                    />,
                ];
            })}
            {addPosition === 'footer' && <Group>{addButton}</Group>}
        </Stack>
    );
};

export default OrderedDataAppVizFieldSelect;
