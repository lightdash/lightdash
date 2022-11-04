import { AnchorButton } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import { FC, useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { useSavedCharts } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import LinkButton from '../../common/LinkButton';
import ResourceList from '../../common/ResourceList';
import { SortDirection } from '../../common/ResourceList/ResourceTable';

interface Props {
    projectUuid: string;
}

const LatestSavedCharts: FC<Props> = ({ projectUuid }) => {
    const { user, health } = useApp();
    const history = useHistory();
    const isDemo = health.data?.mode === LightdashMode.DEMO;
    const { data: savedCharts = [] } = useSavedCharts(projectUuid);

    const userCanManageCharts = user.data?.ability?.can(
        'manage',
        subject('SavedChart', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const handleCreateChart = () => {
        history.push(`/projects/${projectUuid}/tables`);
    };

    const featuredCharts = useMemo(() => {
        return savedCharts
            .sort((a, b) => {
                return (
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime()
                );
            })
            .slice(0, 5);
    }, [savedCharts]);

    return (
        <ResourceList
            resourceIcon="chart"
            resourceType="chart"
            resourceList={featuredCharts}
            enableSorting={false}
            defaultSort={{
                updatedAt: SortDirection.DESC,
            }}
            showCount={false}
            getURL={({ uuid }) => `/projects/${projectUuid}/saved/${uuid}`}
            headerTitle="Recently updated charts"
            headerAction={
                savedCharts.length === 0 ? (
                    <AnchorButton
                        target="_blank"
                        text="Learn"
                        minimal
                        href="https://docs.lightdash.com/get-started/exploring-data/sharing-insights"
                    />
                ) : userCanManageCharts && !isDemo ? (
                    <LinkButton
                        text={`View all ${savedCharts.length}`}
                        minimal
                        intent="primary"
                        href={`/projects/${projectUuid}/saved`}
                    />
                ) : null
            }
            onClickCTA={
                !isDemo && userCanManageCharts ? handleCreateChart : undefined
            }
        />
    );
};

export default LatestSavedCharts;
