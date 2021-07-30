import React, { useEffect } from 'react';
import { Card } from '@blueprintjs/core';
import { ExploreSideBar } from '../components/ExploreSideBar';
import { Explorer } from '../components/Explorer';
import { useExplorerRoute } from '../hooks/useExplorerRoute';
import { useApp } from '../providers/AppProvider';

const ExplorerPage = () => {
    useExplorerRoute();
    const { rudder } = useApp();

    useEffect(() => {
        rudder.page(undefined, 'explore');
    }, [rudder]);

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
            <Card
                style={{
                    height: 'calc(100vh - 50px)',
                    width: '400px',
                    marginRight: '10px',
                    overflow: 'hidden',
                    position: 'sticky',
                    top: '50px',
                }}
                elevation={1}
            >
                <ExploreSideBar />
            </Card>
            <div
                style={{
                    padding: '10px 10px',
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    alignItems: 'stretch',
                }}
            >
                <Explorer />
            </div>
        </div>
    );
};

export default ExplorerPage;
