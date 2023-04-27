import { MenuDivider } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';

import { Text, Tooltip } from '@mantine/core';
import React, { FC, memo } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { SidebarDivider } from '../../common/Page/Sidebar';
import PageBreadcrumbs from '../../common/PageBreadcrumbs';
import ExploreTree from '../ExploreTree';
import { LoadingStateWrapper } from './ExplorePanel.styles';

const SideBarLoadingState = () => (
    <LoadingStateWrapper large>
        {[0, 1, 2, 3, 4].map((idx) => (
            <React.Fragment key={idx}>
                <MenuItem2 className="bp4-skeleton" />
                <MenuDivider />
            </React.Fragment>
        ))}
    </LoadingStateWrapper>
);

interface ExplorePanelProps {
    onBack?: () => void;
}

const ExplorePanel: FC<ExplorePanelProps> = memo(({ onBack }) => {
    const activeTableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const additionalMetrics = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.additionalMetrics,
    );
    const activeFields = useExplorerContext(
        (context) => context.state.activeFields,
    );
    const toggleActiveField = useExplorerContext(
        (context) => context.actions.toggleActiveField,
    );

    const { data, status } = useExplore(activeTableName);

    if (status === 'loading') {
        return <SideBarLoadingState />;
    }

    if (!data) return null;

    if (status === 'error') {
        if (onBack) onBack();
        return null;
    }

    return (
        <>
            <PageBreadcrumbs
                size="md"
                items={[
                    ...(onBack
                        ? [
                              {
                                  title: 'Tables',
                                  onClick: onBack,
                              },
                          ]
                        : []),
                    {
                        title: data.label,
                        active: true,
                        tooltipProps: {
                            withArrow: true,
                            withinPortal: true,
                            disabled: !data.tables[data.baseTable].description,
                            label: data.tables[data.baseTable].description,
                        },
                    },
                ]}
            />

            <ExploreTree
                explore={data}
                additionalMetrics={additionalMetrics || []}
                selectedNodes={activeFields}
                onSelectedFieldChange={toggleActiveField}
            />
        </>
    );
});

export default ExplorePanel;
