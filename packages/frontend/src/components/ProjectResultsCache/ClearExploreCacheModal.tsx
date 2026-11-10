import { Checkbox } from '@mantine/core';
import { useState, type FC } from 'react';
import { useInvalidateExploresResultsCache } from '../../hooks/useProjectResultsCacheSettings';
import MantineModal from '../common/MantineModal';

type Props = {
    projectUuid: string;
    exploreName: string;
    onClose: () => void;
};

export const ClearExploreCacheModal: FC<Props> = ({
    projectUuid,
    exploreName,
    onClose,
}) => {
    const [includeJoinedExplores, setIncludeJoinedExplores] = useState(false);
    const { mutate: invalidateCache, isLoading } =
        useInvalidateExploresResultsCache(projectUuid);

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Clear cached results for everyone?"
            role="alertdialog"
            description="Cached results for this explore are cleared for every user, including on charts, dashboards and embeds. The next person to run a query on it waits for a fresh warehouse query."
            confirmLabel="Clear for everyone"
            confirmLoading={isLoading}
            onConfirm={() =>
                invalidateCache(
                    { exploreNames: [exploreName], includeJoinedExplores },
                    { onSettled: onClose },
                )
            }
        >
            <Checkbox
                label="Also clear explores that use this table"
                description="Includes every explore that joins this explore's base table or is built on it."
                checked={includeJoinedExplores}
                onChange={(event) =>
                    setIncludeJoinedExplores(event.currentTarget.checked)
                }
            />
        </MantineModal>
    );
};
