import { Card } from '@blueprintjs/core';
import React from 'react';
import { Explorer } from '../components/Explorer';
import { ExploreSideBar } from '../components/ExploreSideBar';
import { useExplorerRoute } from '../hooks/useExplorerRoute';

const ExplorerPage = () => {
    useExplorerRoute();

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
                    flexBasis: '400px',
                    flexGrow: 0,
                    flexShrink: 0,
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
                    minWidth: 0,
                }}
            >
                <Explorer />
            </div>
        </div>
    );
};

export default ExplorerPage;
