import { getDataAppBuilderPath } from '@lightdash/common';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import { DataAppBuildCard } from './DataAppBuildCard';
import {
    getDataAppRestoreCardState,
    type DataAppRestoreContextItem,
} from './dataAppBuildCardState';
import { useDataAppCardPreview } from './useDataAppCardPreview';

type Props = {
    item: DataAppRestoreContextItem;
    /** The assistant's response to the restore turn. */
    completionMessage: string | null;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
    compact: boolean;
};

/** The build card for a restore made from the thread; View opens the new version. */
export const AiDataAppRestoreCard: FC<Props> = ({
    item,
    completionMessage,
    projectUuid,
    agentUuid,
    threadUuid,
    messageUuid,
    compact,
}) => {
    const navigate = useNavigate();
    const { source, isActive, openPreview } = useDataAppCardPreview({
        projectUuid,
        agentUuid,
        threadUuid,
        messageUuid,
        appUuid: item.appUuid,
        version: item.version,
    });

    return (
        <DataAppBuildCard
            state={getDataAppRestoreCardState(item, completionMessage, source)}
            compact={compact}
            isActive={isActive}
            onOpenBuilder={() =>
                void navigate(getDataAppBuilderPath(projectUuid, item.appUuid))
            }
            onView={openPreview}
        />
    );
};
