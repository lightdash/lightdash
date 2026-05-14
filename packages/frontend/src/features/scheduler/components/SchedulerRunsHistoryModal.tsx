import { type SchedulerRun } from '@lightdash/common';
import { Button } from '@mantine-8/core';
import { IconChevronLeft, IconHistory } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import LogsTable from '../../../components/SchedulersView/LogsTable';
import { useGetSlack, useSlackChannels } from '../../../hooks/slack/useSlack';

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
    const { data: slackInstallation } = useGetSlack();
    const organizationHasSlack = !!slackInstallation?.organizationUuid;
    const slackChannelsQuery = useSlackChannels(
        '',
        { excludeArchived: false },
        { enabled: organizationHasSlack },
    );
    const slackChannelMap = useMemo(() => {
        const map = new Map<string, string>();
        slackChannelsQuery?.data?.forEach((c) => map.set(c.id, c.name));
        return map;
    }, [slackChannelsQuery?.data]);
    const getSlackChannelName = useCallback(
        (channelId: string) => slackChannelMap.get(channelId) ?? null,
        [slackChannelMap],
    );

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
