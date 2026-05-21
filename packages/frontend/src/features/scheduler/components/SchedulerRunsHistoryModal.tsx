import { type SchedulerRun } from '@lightdash/common';
import { Button } from '@mantine-8/core';
import { IconChevronLeft, IconHistory } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import LogsTable from '../../../components/SchedulersView/LogsTable';
import { useGetSlackChannelName } from '../../../hooks/slack/useGetSlackChannelName';

type Props = {
    onBack: () => void;
    onClose: () => void;
    onSelectRun: (run: SchedulerRun) => void;
    resourceType: 'dashboard' | 'chart';
    resourceUuid: string;
    schedulerUuid: string;
    schedulerName: string;
    /**
     * The project that hosts the resource. Used by `LogsTable` for downstream
     * lookups (e.g. CreatedBy filter user list — hidden in this scope but
     * still required as a fallback).
     */
    projectUuid: string;
};

const SchedulerRunsHistoryModal: FC<Props> = ({
    onBack,
    onClose,
    onSelectRun,
    resourceType,
    resourceUuid,
    schedulerUuid,
    schedulerName,
    projectUuid,
}) => {
    const { getSlackChannelName } = useGetSlackChannelName();

    const resourceScope = useMemo(
        () => ({ resourceType, resourceUuid, schedulerUuid }),
        [resourceType, resourceUuid, schedulerUuid],
    );

    return (
        <MantineModal
            opened
            onClose={onClose}
            size="xl"
            title={`Run history – ${schedulerName}`}
            icon={IconHistory}
            cancelLabel={false}
            modalBodyProps={{ bg: 'background' }}
            leftActions={
                <Button
                    onClick={onBack}
                    variant="subtle"
                    leftSection={<MantineIcon icon={IconChevronLeft} />}
                >
                    Back
                </Button>
            }
            bodyScrollAreaMaxHeight="80vh"
        >
            <LogsTable
                projectUuid={projectUuid}
                getSlackChannelName={getSlackChannelName}
                resourceScope={resourceScope}
                onSelectRun={onSelectRun}
            />
        </MantineModal>
    );
};

export default SchedulerRunsHistoryModal;
