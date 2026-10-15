import { ChartSourceType, ContentType } from '@lightdash/common';
import { Button, type ModalProps } from '@mantine/core';
import { IconFolders } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useContentAction } from '../../../hooks/useContent';
import Callout from '../Callout';
import MantineModal from '../MantineModal';

interface Props extends ModalProps {
    uuid: string;
    name: string;
    spaceUuid: string;
    spaceName: string;
    projectUuid: string | undefined;
    onConfirm: () => void;
}

const MoveChartThatBelongsToDashboardModal: FC<Props> = ({
    opened,
    onClose,
    uuid,
    name,
    spaceUuid,
    spaceName,
    onConfirm,
    projectUuid,
}) => {
    const { t } = useTranslation('modals');
    const { mutate: contentAction } = useContentAction(projectUuid, {
        onSuccess: async () => {
            onConfirm();
            onClose();
        },
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('moveChartFromDashboard.title', { name })}
            icon={IconFolders}
            size="lg"
            actions={
                <Button
                    onClick={() => {
                        contentAction({
                            action: {
                                type: 'move',
                                targetSpaceUuid: spaceUuid,
                            },
                            item: {
                                uuid,
                                contentType: ContentType.CHART,
                                source: ChartSourceType.DBT_EXPLORE,
                            },
                        });
                    }}
                >
                    {t('moveChartFromDashboard.move')}
                </Button>
            }
            description={t('moveChartFromDashboard.description', {
                name,
                spaceName,
            })}
        >
            <Callout variant="warning" title={t('cannotBeUndone')}>
                {t('moveChartFromDashboard.warning')}
            </Callout>
        </MantineModal>
    );
};

export default MoveChartThatBelongsToDashboardModal;
