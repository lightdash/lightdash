import { type Dashboard, type DashboardTab } from '@lightdash/common';
import { Button, Select, Text, type ModalProps } from '@mantine/core';
import { IconArrowAutofitContent } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineModal from '../../common/MantineModal';

type Tile = Dashboard['tiles'][number];
type Props = Pick<ModalProps, 'opened' | 'onClose' | 'className'> & {
    tile: Tile;
    tabs?: DashboardTab[];
    onConfirm: (tile: Tile) => void;
};

const MoveTileToTabModal: FC<Props> = ({
    opened,
    onClose,
    tabs,
    tile,
    onConfirm,
    className,
}) => {
    const { t } = useTranslation('dashboard');
    const [selectedTabId, setSelectedTabId] = useState<string | null>(null);

    const handleConfirm = useCallback(() => {
        if (selectedTabId) {
            onConfirm({
                ...tile,
                x: 0,
                y: 0,
                tabUuid: selectedTabId,
            });
        }
    }, [onConfirm, selectedTabId, tile]);

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('tileForms.moveToTab.title')}
            icon={IconArrowAutofitContent}
            actions={
                <Button onClick={handleConfirm} disabled={!selectedTabId}>
                    {t('tileForms.moveToTab.confirm')}
                </Button>
            }
            modalRootProps={{ className }}
        >
            {tabs && tabs.length ? (
                <Select
                    label={t('tileForms.moveToTab.selectLabel')}
                    value={selectedTabId}
                    placeholder={t('tabs.deleteModal.pickTabPlaceholder')}
                    data={tabs
                        .filter((tab) => tab.uuid !== tile.tabUuid)
                        .map((tab) => ({
                            value: tab.uuid,
                            label: tab.name,
                        }))}
                    onChange={(value) => setSelectedTabId(value)}
                />
            ) : (
                <Text>{t('tileForms.moveToTab.noTabs')}</Text>
            )}
        </MantineModal>
    );
};

export default MoveTileToTabModal;
