/**
 * Adds a warehouse connection from Semantic Layer through the same dialogs as
 * project settings: a project on one connection switches to several first,
 * one with several adds another.
 */
import { type FC } from 'react';
import { AddConnectionModal } from '../../components/ProjectConnection/ConnectionsPanel';
import { EnableMultipleConnectionsModal } from '../../components/ProjectConnection/EnableMultipleConnections';
import { useProject } from '../../hooks/useProject';
import { type StudioWarehouses } from './warehouses';

export const AddWarehouseModal: FC<{
    projectUuid: string;
    warehouses: StudioWarehouses;
    onClose: () => void;
}> = ({ projectUuid, warehouses, onClose }) => {
    const { data: project } = useProject(projectUuid);
    const { mode, originalWarehouseType } = warehouses;
    if (!project || !originalWarehouseType) return null;
    const primaryRequiresUserCredentials =
        project.warehouseConnection?.requireUserCredentials === true;
    return mode === 'single' ? (
        <EnableMultipleConnectionsModal
            projectUuid={projectUuid}
            warehouseType={originalWarehouseType}
            primaryRequiresUserCredentials={primaryRequiresUserCredentials}
            onClose={onClose}
        />
    ) : (
        <AddConnectionModal
            projectUuid={projectUuid}
            warehouseType={originalWarehouseType}
            primaryRequiresUserCredentials={primaryRequiresUserCredentials}
            onClose={onClose}
        />
    );
};
