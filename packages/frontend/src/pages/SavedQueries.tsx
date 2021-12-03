import { NonIdealState, Spinner } from '@blueprintjs/core';
import { SpaceQuery } from 'common';
import React, { FC, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import SavedQueriesContent from '../components/SavedQueries/SavedQueriesContent';
import { useSpaces } from '../hooks/useSpaces';

const SavedQueries: FC = () => {
    const [selectedMenu, setSelectedMenu] = useState<string>();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { isLoading, data } = useSpaces(projectUuid);

    const savedQueries: SpaceQuery[] = useMemo(
        () => data?.find(({ uuid }) => uuid === selectedMenu)?.queries || [],
        [selectedMenu, data],
    );

    useEffect(() => {
        if (!selectedMenu && data && data.length > 0) {
            setSelectedMenu(data[0].uuid);
        }
    }, [selectedMenu, data]);

    if (isLoading) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading charts" icon={<Spinner />} />
            </div>
        );
    }

    return (
        <div
            style={{
                paddingTop: '30px',
                width: '100%',
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'center',
            }}
        >
            <SavedQueriesContent
                savedQueries={savedQueries}
                projectUuid={projectUuid}
            />
        </div>
    );
};

export default SavedQueries;
