import { Button, Classes, Dialog, HTMLSelect, Intent } from '@blueprintjs/core';
import { Dashboard, friendlyName, SavedChart } from '@lightdash/common';
import React, { FC, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
    useDashboardQuery,
    useUpdateDashboard,
} from '../../../hooks/dashboard/useDashboard';
import { useSavedQuery, useUpdateMutation } from '../../../hooks/useSavedQuery';
import { useSpaces } from '../../../hooks/useSpaces';

interface Props {
    uuid: string;
    isOpen: boolean;
    isChart?: boolean;
    onClose?: () => void;
}

const MoveToSpaceModal: FC<Props> = ({ uuid, isOpen, isChart, onClose }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { data: spaces, isLoading: isLoadingSpace } = useSpaces(projectUuid);
    const { data: savedChart, isLoading: isLoadingChart } = useSavedQuery(
        isChart ? { id: uuid } : undefined,
    );
    const { data: dashboard, isLoading: isLoadingDashboard } =
        useDashboardQuery(!isChart ? uuid : undefined);

    const selectedItem: SavedChart | Dashboard | undefined = isChart
        ? savedChart
        : dashboard;
    const selectedSpaceUuid = selectedItem && selectedItem.spaceUuid;
    const isLoading = isLoadingSpace || isLoadingChart || isLoadingDashboard;
    const { mutate: chartMutation, isLoading: isSavingChart } =
        useUpdateMutation(uuid);
    const { mutate: dashboardMutation, isLoading: isSavingDashboard } =
        useUpdateDashboard(uuid);

    const isSaving = isSavingChart || isSavingDashboard;
    const [selectedSpace, setSelectedSpace] = useState<string | undefined>(
        selectedSpaceUuid,
    );

    useEffect(() => {
        if (selectedSpaceUuid) {
            setSelectedSpace(selectedSpaceUuid);
        }
    }, [selectedSpaceUuid, setSelectedSpace]);

    const handleSubmit = useCallback(
        (data) => {
            if (isChart) chartMutation(data);
            else dashboardMutation(data);
            if (onClose) onClose();
        },
        [chartMutation, dashboardMutation, isChart, onClose],
    );

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            lazy
            title={`Move ${isChart ? 'chart' : 'dashboard'} to space`}
        >
            <div className={Classes.DIALOG_BODY}>
                <p>
                    Select the space you want to move this{' '}
                    {isChart ? 'chart' : 'dashboard'}{' '}
                    <b>{selectedItem && selectedItem.name}</b> to.
                </p>
                <HTMLSelect
                    value={selectedSpace}
                    options={
                        spaces &&
                        spaces.map((space) => ({
                            value: space.uuid,
                            label: friendlyName(space.name),
                        }))
                    }
                    onChange={(e) => {
                        setSelectedSpace(e.target.value);
                    }}
                    defaultValue="horizontal"
                />
            </div>
            <div className={Classes.DIALOG_FOOTER}>
                <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button
                        intent={Intent.SUCCESS}
                        text="Save"
                        disabled={isLoading || isSaving}
                        onClick={handleSubmit}
                    />
                </div>
            </div>
        </Dialog>
    );
};

export default MoveToSpaceModal;
