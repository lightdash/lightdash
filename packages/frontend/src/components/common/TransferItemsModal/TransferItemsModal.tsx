import {
    assertUnreachable,
    getResourceViewItemName,
    ResourceViewItemType,
    type ResourceViewItem,
} from '@lightdash/common';
import { Button, Group, LoadingOverlay, Text } from '@mantine/core';
import { IconFolderShare, IconPlus } from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { useCallback, useMemo, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useSpaceManagement } from '../../../hooks/useSpaceManagement';
import { usePersonalSpace, useSpaceSummaries } from '../../../hooks/useSpaces';
import Callout from '../Callout';
import MantineIcon from '../MantineIcon';
import MantineModal, { type MantineModalProps } from '../MantineModal';
import SpaceCreationForm from '../SpaceSelector/SpaceCreationForm';
import SpaceSelector from '../SpaceSelector/SpaceSelector';

type Props<T> = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    items: T;
    isLoading: boolean;
    onConfirm: (spaceUuid: string | null) => void;
    title?: string;
    description?: ReactNode;
    confirmLabel?: string;
    createSpaceConfirmLabel?: string;
    /** Extra content rendered in the modal's fixed footer bar, next to the
     *  "New Space" button — e.g. per-content-type move options. Lives outside
     *  the scrollable space list so it stays visible however many spaces there
     *  are. Hidden while the create-space form is open. */
    footer?: ReactNode;
};

const itemNameElement = <Text fw={600} component="span" />;

const getDefaultTitle = <T extends ResourceViewItem>(
    t: TFunction,
    items: T[],
): string => {
    if (items.length !== 1) return t('transferItems.title.items');
    switch (items[0].type) {
        case ResourceViewItemType.CHART:
            return t('transferItems.title.chart');
        case ResourceViewItemType.DASHBOARD:
            return t('transferItems.title.dashboard');
        case ResourceViewItemType.SPACE:
            return t('transferItems.title.space');
        case ResourceViewItemType.DATA_APP:
            return t('transferItems.title.dataApp');
        case ResourceViewItemType.DOCUMENT:
            return t('transferItems.title.document');
        default:
            return assertUnreachable(items[0], 'Invalid item type');
    }
};

const TransferItemsModal = <R extends ResourceViewItem, T extends Array<R>>({
    projectUuid,
    opened,
    onClose,
    items,
    onConfirm,
    isLoading,
    title,
    description,
    confirmLabel,
    createSpaceConfirmLabel,
    footer,
}: Props<T>) => {
    const { t } = useTranslation('modals');
    // Fetch spaces only when the modal is opened
    const { data: spaces = [], isLoading: isLoadingSpaces } = useSpaceSummaries(
        projectUuid,
        true,
        { enabled: opened },
    );

    const isMovingSingleItem = items.length === 1;
    const isSavingPersonalDocument =
        isMovingSingleItem &&
        items[0].type === ResourceViewItemType.DOCUMENT &&
        items[0].data.spaceUuid === null;
    // A personal Document is first saved to the user's own Space when they have one
    const { data: personalSpace } = usePersonalSpace(projectUuid, {
        enabled: opened && isSavingPersonalDocument,
    });

    const defaultSpaceUuid = useMemo(() => {
        // return space uuid only if there's a single item (i.e. not a bulk transfer)
        if (!isMovingSingleItem) return undefined;

        const item = items[0];

        switch (item.type) {
            case ResourceViewItemType.SPACE:
                return item.data.parentSpaceUuid ?? undefined;
            case ResourceViewItemType.CHART:
            case ResourceViewItemType.DASHBOARD:
                return item.data.spaceUuid;
            case ResourceViewItemType.DOCUMENT:
                return item.data.spaceUuid ?? personalSpace?.uuid;
            case ResourceViewItemType.DATA_APP:
                return item.data.spaceUuid ?? undefined;
            default:
                return assertUnreachable(item, 'Invalid item type');
        }
    }, [isMovingSingleItem, items, personalSpace?.uuid]);

    const singleItemType = useMemo(() => {
        if (items.some((item) => item.type === ResourceViewItemType.DOCUMENT)) {
            return ResourceViewItemType.DOCUMENT;
        }
        if (!isMovingSingleItem) return undefined;
        return items[0].type;
    }, [isMovingSingleItem, items]);

    const allSelectedItemsAreSpaces = useMemo(
        () => items.every((i) => i.type === ResourceViewItemType.SPACE),
        [items],
    );

    const {
        selectedSpaceUuid,
        setSelectedSpaceUuid,
        isCreatingNewSpace,
        newSpaceName,
        setNewSpaceName,
        createSpaceMutation,
        handleCreateNewSpace,
        openCreateSpaceForm,
        closeCreateSpaceForm,
        inheritanceValue,
        setInheritanceValue,
    } = useSpaceManagement({
        projectUuid,
        defaultSpaceUuid,
    });

    const selectedSpaceLabel = useMemo(() => {
        if (!selectedSpaceUuid) return '';
        return (
            spaces.find((space) => space.uuid === selectedSpaceUuid)?.name || ''
        );
    }, [selectedSpaceUuid, spaces]);

    const handleConfirm = useCallback(() => {
        onConfirm(selectedSpaceUuid);
    }, [selectedSpaceUuid, onConfirm]);

    const createSpace = useCallback(async () => {
        try {
            const result = await handleCreateNewSpace();
            if (result?.uuid) {
                onConfirm(result.uuid);
            }
        } catch (error) {
            console.error('Failed to create space:', error);
        }
    }, [handleCreateNewSpace, onConfirm]);

    if (items.length === 0) return null;

    return (
        <MantineModal
            title={title ?? getDefaultTitle(t, items)}
            opened={opened}
            onClose={onClose}
            icon={IconFolderShare}
            size="xl"
            leftActions={
                !isCreatingNewSpace ? (
                    <Group gap="lg" wrap="nowrap">
                        <Button
                            variant="subtle"
                            size="xs"
                            onClick={openCreateSpaceForm}
                            leftSection={<MantineIcon icon={IconPlus} />}
                        >
                            {t('newSpace')}
                        </Button>
                        {footer}
                    </Group>
                ) : null
            }
            actions={
                isCreatingNewSpace ? (
                    <Button
                        loading={createSpaceMutation.isLoading}
                        disabled={newSpaceName.length === 0}
                        onClick={createSpace}
                    >
                        {createSpaceConfirmLabel ??
                            t('transferItems.createSpaceAndMove')}
                    </Button>
                ) : (
                    <Button
                        disabled={
                            !selectedSpaceUuid && !allSelectedItemsAreSpaces
                        }
                        onClick={handleConfirm}
                        // Anchor for scope walkthroughs (data-tour-via)
                        data-tour-anchor="transfer-confirm"
                        data-tour-hint="Confirm the move"
                    >
                        {confirmLabel ?? t('actions.confirm', { ns: 'common' })}
                    </Button>
                )
            }
        >
            <LoadingOverlay
                visible={
                    createSpaceMutation.isLoading ||
                    isLoading ||
                    isLoadingSpaces
                }
            />

            {isCreatingNewSpace ? (
                <SpaceCreationForm
                    spaceName={newSpaceName}
                    onSpaceNameChange={setNewSpaceName}
                    onCancel={closeCreateSpaceForm}
                    isLoading={createSpaceMutation.isLoading}
                    parentSpaceName={selectedSpaceLabel}
                    inheritanceValue={inheritanceValue ?? undefined}
                    onInheritanceChange={setInheritanceValue}
                />
            ) : (
                <>
                    {description ?? (
                        <Text fz="sm" fw={500}>
                            {isMovingSingleItem ? (
                                <Trans
                                    t={t}
                                    i18nKey="transferItems.selectSpaceSingle"
                                    values={{
                                        name: getResourceViewItemName(items[0]),
                                    }}
                                    components={{ name: itemNameElement }}
                                />
                            ) : (
                                t('transferItems.selectSpaceMany', {
                                    count: items.length,
                                })
                            )}
                        </Text>
                    )}

                    <SpaceSelector
                        itemType={singleItemType}
                        projectUuid={projectUuid}
                        spaces={spaces}
                        selectedSpaceUuid={selectedSpaceUuid}
                        onSelectSpace={setSelectedSpaceUuid}
                        isLoading={createSpaceMutation.isLoading}
                        isRootSelectionEnabled={allSelectedItemsAreSpaces}
                    >
                        {!isCreatingNewSpace && selectedSpaceLabel ? (
                            <Callout variant="info">
                                <Text fw={500} fz="sm">
                                    {isMovingSingleItem ? (
                                        <Trans
                                            t={t}
                                            i18nKey="transferItems.moveSingleTo"
                                            values={{
                                                name: getResourceViewItemName(
                                                    items[0],
                                                ),
                                                space: selectedSpaceLabel,
                                            }}
                                            components={{
                                                name: itemNameElement,
                                                space: itemNameElement,
                                            }}
                                        />
                                    ) : (
                                        <Trans
                                            t={t}
                                            i18nKey="transferItems.moveManyTo"
                                            count={items.length}
                                            values={{
                                                space: selectedSpaceLabel,
                                            }}
                                            components={{
                                                space: itemNameElement,
                                            }}
                                        />
                                    )}
                                </Text>
                            </Callout>
                        ) : null}
                    </SpaceSelector>
                </>
            )}
        </MantineModal>
    );
};

export default TransferItemsModal;
