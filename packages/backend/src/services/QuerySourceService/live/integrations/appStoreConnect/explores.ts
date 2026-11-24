import { DimensionType, FilterOperator, MetricType } from '@lightdash/common';
import type {
    LiveDimensionDefinition,
    LiveExploreDefinition,
    LiveMetricDefinition,
} from '../../explores/definition';

export const APP_STORE_CONNECT_FILTERS = [FilterOperator.EQUALS];

const dimension = (
    name: string,
    apiName: string,
    label: string,
    type: DimensionType,
    description: string,
    { filterable = false }: { filterable?: boolean } = {},
): LiveDimensionDefinition => ({
    name,
    apiName,
    label,
    description,
    type,
    filterOperators: filterable ? APP_STORE_CONNECT_FILTERS : [],
});

const COUNT: LiveMetricDefinition = {
    name: 'count',
    apiName: 'total',
    label: 'Count',
    description:
        'How many match the filters, from the total App Store Connect reports for the list.',
    type: MetricType.NUMBER,
    filterOperators: [],
    aggregation: { aggregation: 'additive' },
};

const countIncompatibility = (dimensions: LiveDimensionDefinition[]) => ({
    fields: [COUNT.name],
    with: dimensions.map(({ name }) => name),
    reason: "App Store Connect returns one total, so Count can't be split by a dimension. Filter by it instead, or list rows without Count.",
    selectedOnly: true as const,
});

const explore = (
    definition: Omit<
        LiveExploreDefinition,
        | 'metrics'
        | 'maxDimensions'
        | 'maxMetrics'
        | 'dateRange'
        | 'incompatible'
    >,
): LiveExploreDefinition => ({
    ...definition,
    metrics: [COUNT],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [countIncompatibility(definition.dimensions)],
});

export const APP_STORE_CONNECT_VERSIONS_EXPLORE = explore({
    name: 'versions',
    label: 'App Store versions',
    description:
        "The app's App Store versions with their state, read live from App Store Connect. Count is the total for the filters.",
    dimensions: [
        dimension(
            'version_id',
            'id',
            'Version ID',
            DimensionType.STRING,
            "App Store Connect's ID for the version.",
        ),
        dimension(
            'version',
            'versionString',
            'Version',
            DimensionType.STRING,
            'The version number shown on the App Store, such as 1.0.7.',
            { filterable: true },
        ),
        dimension(
            'platform',
            'platform',
            'Platform',
            DimensionType.STRING,
            'IOS, MAC_OS, TV_OS or VISION_OS.',
            { filterable: true },
        ),
        dimension(
            'state',
            'appVersionState',
            'State',
            DimensionType.STRING,
            'Where the version is, such as PREPARE_FOR_SUBMISSION, WAITING_FOR_REVIEW, IN_REVIEW, REJECTED, PENDING_DEVELOPER_RELEASE or READY_FOR_DISTRIBUTION.',
            { filterable: true },
        ),
        dimension(
            'release_type',
            'releaseType',
            'Release type',
            DimensionType.STRING,
            'How the version is released once approved: MANUAL, AFTER_APPROVAL or SCHEDULED.',
        ),
        dimension(
            'review_type',
            'reviewType',
            'Review type',
            DimensionType.STRING,
            'APP_STORE or NOTARIZATION.',
        ),
        dimension(
            'created_at',
            'createdDate',
            'Created',
            DimensionType.TIMESTAMP,
            'When the version was created in App Store Connect.',
        ),
        dimension(
            'earliest_release_at',
            'earliestReleaseDate',
            'Earliest release',
            DimensionType.TIMESTAMP,
            'The earliest time a scheduled version is released.',
        ),
        dimension(
            'downloadable',
            'downloadable',
            'Downloadable',
            DimensionType.BOOLEAN,
            'Whether people can download the version.',
        ),
    ],
});

export const APP_STORE_CONNECT_BUILDS_EXPLORE = explore({
    name: 'builds',
    label: 'Builds',
    description:
        "The app's uploaded builds, including TestFlight builds, read live from App Store Connect. App Store Connect can't filter builds; Count is the total.",
    dimensions: [
        dimension(
            'build_id',
            'id',
            'Build ID',
            DimensionType.STRING,
            "App Store Connect's ID for the build.",
        ),
        dimension(
            'build_number',
            'version',
            'Build number',
            DimensionType.STRING,
            'The build number, not the version shown on the App Store.',
        ),
        dimension(
            'uploaded_at',
            'uploadedDate',
            'Uploaded',
            DimensionType.TIMESTAMP,
            'When the build was uploaded.',
        ),
        dimension(
            'expires_at',
            'expirationDate',
            'Expires',
            DimensionType.TIMESTAMP,
            'When the build expires in TestFlight.',
        ),
        dimension(
            'expired',
            'expired',
            'Expired',
            DimensionType.BOOLEAN,
            'Whether the build has expired.',
        ),
        dimension(
            'min_os_version',
            'minOsVersion',
            'Minimum OS version',
            DimensionType.STRING,
            'The oldest operating system version the build runs on.',
        ),
        dimension(
            'processing_state',
            'processingState',
            'Processing state',
            DimensionType.STRING,
            'PROCESSING, FAILED, INVALID or VALID.',
        ),
        dimension(
            'audience_type',
            'buildAudienceType',
            'Audience',
            DimensionType.STRING,
            'Who the build is for, such as INTERNAL_ONLY or APP_STORE_ELIGIBLE.',
        ),
        dimension(
            'uses_non_exempt_encryption',
            'usesNonExemptEncryption',
            'Uses non-exempt encryption',
            DimensionType.BOOLEAN,
            'Whether the build declares encryption that needs export compliance documents.',
        ),
    ],
});

export const APP_STORE_CONNECT_CUSTOMER_REVIEWS_EXPLORE = explore({
    name: 'customer_reviews',
    label: 'Customer reviews',
    description:
        "Written customer reviews of the app on the App Store, read live from App Store Connect. Count is the total for the filters; App Store Connect doesn't report an average rating.",
    dimensions: [
        dimension(
            'review_id',
            'id',
            'Review ID',
            DimensionType.STRING,
            "App Store Connect's ID for the review.",
        ),
        dimension(
            'rating',
            'rating',
            'Rating',
            DimensionType.NUMBER,
            'Stars, from 1 to 5.',
            { filterable: true },
        ),
        dimension(
            'title',
            'title',
            'Title',
            DimensionType.STRING,
            'The review title.',
        ),
        dimension(
            'body',
            'body',
            'Body',
            DimensionType.STRING,
            'The review text.',
        ),
        dimension(
            'reviewer_nickname',
            'reviewerNickname',
            'Reviewer nickname',
            DimensionType.STRING,
            'The nickname the reviewer shows on the App Store.',
        ),
        dimension(
            'territory',
            'territory',
            'Territory',
            DimensionType.STRING,
            'The App Store territory, as a three-letter code such as USA or GBR.',
            { filterable: true },
        ),
        dimension(
            'created_at',
            'createdDate',
            'Created',
            DimensionType.TIMESTAMP,
            'When the review was written.',
        ),
    ],
});

export const APP_STORE_CONNECT_REVIEW_SUBMISSIONS_EXPLORE = explore({
    name: 'review_submissions',
    label: 'Review submissions',
    description:
        "The app's submissions to App Review and their state, read live from App Store Connect. Count is the total for the filters.",
    dimensions: [
        dimension(
            'submission_id',
            'id',
            'Submission ID',
            DimensionType.STRING,
            "App Store Connect's ID for the submission.",
        ),
        dimension(
            'platform',
            'platform',
            'Platform',
            DimensionType.STRING,
            'IOS, MAC_OS, TV_OS or VISION_OS.',
            { filterable: true },
        ),
        dimension(
            'state',
            'state',
            'State',
            DimensionType.STRING,
            'READY_FOR_REVIEW, WAITING_FOR_REVIEW, IN_REVIEW, UNRESOLVED_ISSUES, CANCELING, COMPLETING or COMPLETE.',
            { filterable: true },
        ),
        dimension(
            'submitted_at',
            'submittedDate',
            'Submitted',
            DimensionType.TIMESTAMP,
            'When the submission was sent to App Review.',
        ),
    ],
});
