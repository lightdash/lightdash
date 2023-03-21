import { NonIdealState, Spinner } from '@blueprintjs/core';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import ErrorState from '../components/common/ErrorState';

import { useSavedQuery } from '../hooks/useSavedQuery';

import EditModeExplorer from './EditModeExplorer';
import ViewModeExplorer from './ViewModeExplorer';

const SavedExplorer = () => {
    const { savedQueryUuid, mode } = useParams<{
        savedQueryUuid: string;
        projectUuid: string;
        mode?: string;
    }>();
    const isEditMode = useMemo(() => mode === 'edit', [mode]);
    const { isLoading, error } = useSavedQuery({
        id: savedQueryUuid,
    });

    if (isLoading) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading..." icon={<Spinner />} />
            </div>
        );
    }
    if (error) {
        return <ErrorState error={error.error} />;
    }

    if (isEditMode) {
        return <EditModeExplorer />;
    } else {
        return <ViewModeExplorer />;
    }
};

export default SavedExplorer;
