import { ChartSourceType, ContentType } from '@lightdash/common';
import { Button, type ModalProps } from '@mantine-8/core';
import { IconFolders } from '@tabler/icons-react';
import { type FC } from 'react';
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
            title={`Move "${name}"`}
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
                    Move
                </Button>
            }
            description={`Are you sure you want to move the chart "${name}" to the space "${spaceName}"?`}
        >
            <Callout variant="warning" title="This change cannot be undone.">
                This chart was created from within the dashboard, moving the
                chart to the space will make it available in chart lists across
                the app.
            </Callout>
        </MantineModal>
    );
};

export default MoveChartThatBelongsToDashboardModal;
