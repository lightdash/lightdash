import {
    isPreviewWarehouseSignInExpiredMessage,
    type ApiErrorDetail,
    type QueryHistoryStatus,
} from '@lightdash/common';
import { Anchor, Text } from '@mantine/core';
import { IconTableOff } from '@tabler/icons-react';
import { Fragment, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import useIsEmbedded from '../../../ee/providers/Embed/useIsEmbedded';
import { useProject } from '../../../hooks/useProject';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { TrackSection } from '../../../providers/Tracking/TrackingProvider';
import NoTableIcon from '../../../svgs/emptystate-no-table.svg?react';
import { LD_FIELD_COLORS } from '../../../theme';
import { SectionName } from '../../../types/Events';
import { EmptyState } from '../../common/EmptyState';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import MantineIcon from '../../common/MantineIcon';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import { RefreshButton } from '../../RefreshButton';
import classes from './ExplorerResultsNonIdealStates.module.css';
import { getQueryLoadingStateCopy } from './queryLoadingState';

const ExploreDocumentationUrl =
    'https://docs.lightdash.com/get-started/exploring-data/using-explores/';

const EXAMPLE_QUESTION_KEYS = [
    'emptyStates.noColumns.examples.signupsPerDay',
    'emptyStates.noColumns.examples.orderCountByLocation',
    'emptyStates.noColumns.examples.followersEveryWeek',
    'emptyStates.noColumns.examples.orderCountByStatus',
] as const;

export const EmptyStateNoColumns = () => {
    const { t } = useTranslation('explorer');
    const highlight = {
        metric: <Text span c={LD_FIELD_COLORS.metric.color} />,
        dimension: <Text span c={LD_FIELD_COLORS.dimension.color} />,
    };
    return (
        <EmptyState
            title={
                <>
                    {t('emptyStates.noColumns.title')}{' '}
                    <DocumentationHelpButton
                        href={ExploreDocumentationUrl}
                        pos="relative"
                        top={2}
                        iconProps={{ size: 'lg' }}
                    />
                </>
            }
            description={
                <Trans
                    t={t}
                    i18nKey="emptyStates.noColumns.description"
                    components={highlight}
                />
            }
        >
            <Text className={classes.animatedTextRoot} c="dimmed">
                {EXAMPLE_QUESTION_KEYS.map((key) => (
                    <Text span key={key}>
                        <Trans t={t} i18nKey={key} components={highlight} />
                    </Text>
                ))}
            </Text>
        </EmptyState>
    );
};

export const EmptyStateNoTableData: FC<{ description: React.ReactNode }> = ({
    description,
}) => (
    <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
        <EmptyState
            maw={500}
            description={
                <>
                    {description}{' '}
                    <DocumentationHelpButton
                        href={ExploreDocumentationUrl}
                        pos="relative"
                        top={2}
                    />
                </>
            }
        >
            <RefreshButton size={'xs'} />
        </EmptyState>
    </TrackSection>
);

export const NoTableSelected = () => {
    const { t } = useTranslation('explorer');
    return (
        <EmptyState
            maw={520}
            icon={<NoTableIcon />}
            title={t('emptyStates.noTableSelected.title')}
            description={
                <>
                    {t('emptyStates.noTableSelected.description')}{' '}
                    <DocumentationHelpButton
                        href={ExploreDocumentationUrl}
                        pos="relative"
                        top={2}
                    />
                </>
            }
        />
    );
};

export const EmptyStateExploreLoading = () => {
    const { t } = useTranslation('explorer');
    return <EmptyStateLoader title={t('emptyStates.loadingTables')} />;
};

export const ExploreIdleState = () => {
    const { t } = useTranslation('explorer');
    return <EmptyState title={t('emptyStates.idle')} />;
};

export const ExploreEmptyQueryState = () => {
    const { t } = useTranslation('explorer');
    return (
        <EmptyState
            title={t('emptyStates.noResults.title')}
            description={t('emptyStates.noResults.description')}
        />
    );
};

export const ExploreLoadingState = ({
    queryStatus,
}: {
    queryStatus?: QueryHistoryStatus;
}) => {
    const { title, description } = getQueryLoadingStateCopy(queryStatus);

    return (
        <EmptyStateLoader
            title={title}
            description={description}
            data-testid="results-table-loading"
        />
    );
};

const PreviewSignInExpiredLink: FC = () => {
    const { t } = useTranslation('explorer');
    const { data: project } = useProject(useProjectUuid());
    const upstreamProjectUuid = project?.upstreamProjectUuid;
    if (!upstreamProjectUuid) return null;
    return (
        <Fragment>
            <br />
            <Anchor
                component={Link}
                to={`/generalSettings/projectManagement/${upstreamProjectUuid}/settings`}
            >
                {t('emptyStates.error.openConnectionSettings')}
            </Anchor>
        </Fragment>
    );
};

export const ExploreErrorState = ({
    errorDetail,
}: {
    errorDetail?: ApiErrorDetail | null;
}) => {
    const { t } = useTranslation('explorer');
    const isEmbedded = useIsEmbedded();

    return (
        <EmptyState
            icon={<MantineIcon icon={IconTableOff} />}
            title={t('emptyStates.error.title')}
            description={
                <Fragment>
                    <Text className={classes.errorMessage}>
                        {errorDetail?.message ||
                            t('emptyStates.error.fallbackMessage')}
                    </Text>
                    {errorDetail?.message &&
                        isPreviewWarehouseSignInExpiredMessage(
                            errorDetail.message,
                        ) &&
                        !isEmbedded && <PreviewSignInExpiredLink />}
                    {errorDetail?.data.documentationUrl && !isEmbedded && (
                        <Fragment>
                            <br />
                            <Anchor
                                href={errorDetail.data.documentationUrl}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {t('emptyStates.error.learnHowToResolve')}
                            </Anchor>
                        </Fragment>
                    )}
                </Fragment>
            }
        />
    );
};

export const MissingRequiredParameters = ({
    missingRequiredParameters,
}: {
    missingRequiredParameters: string[];
}) => {
    const { t } = useTranslation('explorer');
    return (
        <EmptyState
            title={t('emptyStates.missingParameters.title')}
            description={
                <>
                    {t('emptyStates.missingParameters.description')}{' '}
                    <Text>
                        {t('emptyStates.missingParameters.provide', {
                            count: missingRequiredParameters.length,
                        })}
                    </Text>
                    <br />
                    <Text span fw={500} size="sm">
                        {missingRequiredParameters.join(', ')}
                    </Text>
                </>
            }
        />
    );
};
