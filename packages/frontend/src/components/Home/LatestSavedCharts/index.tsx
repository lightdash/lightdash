import { AnchorButton } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import { FC, useMemo } from 'react';
import { useSavedCharts } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import LinkButton from '../../common/LinkButton';
import ResourceList from '../../common/ResourceList';

interface Props {
    projectUuid: string;
}

const LatestSavedCharts: FC<Props> = ({ projectUuid }) => {
    const { user, health } = useApp();
    const isDemo = health.data?.mode === LightdashMode.DEMO;
    const { data: savedCharts = [] } = useSavedCharts(projectUuid);

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

    const userCanManageCharts = user.data?.ability?.can(
        'manage',
        subject('SavedChart', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    return (
        <ResourceList
            resourceIcon="chart"
            resourceType="chart"
            resourceList={featuredCharts}
            showSpaceColumn
            enableSorting={false}
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
        />
    );
};

export default LatestSavedCharts;
