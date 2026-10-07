import { SegmentedControl, Stack, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useSearchParams } from 'react-router';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import { SettingsPage } from '../../components/common/Settings/SettingsPage';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import {
    ADOPTION_VIEW_LABELS,
    ADOPTION_VIEWS,
    parseAdoptionView,
    type AdoptionView,
} from '../features/adoption/utils/adoptionNav';
import { useOrgAdoptionSummary } from '../hooks/useOrgDepartments';

const VIEW_PARAM = 'view';

const Adoption: FC = () => {
    const summary = useOrgAdoptionSummary();
    const [searchParams, setSearchParams] = useSearchParams();
    const view = parseAdoptionView(searchParams.get(VIEW_PARAM));

    const setView = (next: AdoptionView) =>
        setSearchParams(
            (previous) => {
                const params = new URLSearchParams(previous);
                params.set(VIEW_PARAM, next);
                return params;
            },
            { replace: true },
        );

    const viewToggle =
        ADOPTION_VIEWS.length > 1 ? (
            <SegmentedControl
                size="xs"
                value={view}
                onChange={(value) => setView(parseAdoptionView(value))}
                data={ADOPTION_VIEWS.map((value) => ({
                    value,
                    label: ADOPTION_VIEW_LABELS[value],
                }))}
            />
        ) : null;

    return (
        <SettingsPage
            title="Adoption"
            isBeta
            description="See how each department is adopting Lightdash, including the ones that haven't started"
            actions={viewToggle}
        >
            {summary.isInitialLoading && <EmptyStateLoader />}
            {summary.isError && (
                <SuboptimalState
                    icon={IconAlertCircle}
                    title="Adoption by department isn't available"
                    description={summary.error.error.message}
                />
            )}
            {summary.data && (
                <Stack gap="md">
                    <Text fz="sm" c="dimmed">
                        {summary.data.organization.memberCount} people on
                        Lightdash · {summary.data.organization.activeCount30d}{' '}
                        active in the last 30 days
                    </Text>
                </Stack>
            )}
        </SettingsPage>
    );
};

export default Adoption;
