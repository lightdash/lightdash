import { useEffect, type FC } from 'react';
import { DrillDownModal } from '../../components/MetricQueryData/DrillDownModal';
import MetricQueryDataProvider from '../../components/MetricQueryData/MetricQueryDataProvider';
import { type DrillDownConfig } from '../../components/MetricQueryData/types';
import { useMetricQueryDataContext } from '../../components/MetricQueryData/useMetricQueryDataContext';
import { useContextMenuPermissions } from '../../hooks/useContextMenuPermissions';

const OpenRequest: FC<{ request: DrillDownConfig | undefined }> = ({
    request,
}) => {
    const { openDrillDownModal } = useMetricQueryDataContext();

    useEffect(() => {
        if (request) openDrillDownModal(request);
    }, [openDrillDownModal, request]);

    return null;
};

/** Supplies the existing core DrillDownModal with per-query source context
 * captured from a full data app's SDK bridge. */
export const AppDrillDownModalHost: FC<{
    projectUuid: string;
    request: DrillDownConfig | undefined;
    onPermissionChange: (allowed: boolean) => void;
}> = ({ projectUuid, request, onPermissionChange }) => {
    const { canDrillInto } = useContextMenuPermissions({ projectUuid });

    useEffect(() => {
        onPermissionChange(canDrillInto);
        return () => onPermissionChange(false);
    }, [canDrillInto, onPermissionChange]);

    if (!canDrillInto) return null;

    return (
        <MetricQueryDataProvider
            tableName=""
            explore={undefined}
            metricQuery={undefined}
        >
            <OpenRequest request={request} />
            <DrillDownModal />
        </MetricQueryDataProvider>
    );
};
