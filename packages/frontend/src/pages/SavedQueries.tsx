import React, { FC, useEffect, useMemo, useState } from 'react';
import { NonIdealState, Spinner } from '@blueprintjs/core';
import { SpaceQuery } from 'common';
import { useParams } from 'react-router-dom';
import SavedQueriesMenu from '../components/SavedQueries/SavedQueriesMenu';
import SavedQueriesContent from '../components/SavedQueries/SavedQueriesContent';
import { useSavedQuery } from '../hooks/useSpaces';

const SavedQueries: FC = () => {
    const [selectedMenu, setSelectedMenu] = useState<string>();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { isLoading, data } = useSavedQuery(projectUuid);

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
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'nowrap',
                justifyContent: 'stretch',
                alignItems: 'flex-start',
            }}
        >
            <SavedQueriesMenu
                data={data}
                selectedMenu={selectedMenu}
                setSelectedMenu={setSelectedMenu}
            />
            <SavedQueriesContent
                savedQueries={savedQueries}
                projectUuid={projectUuid}
            />
        </div>
    );
};

export default SavedQueries;
