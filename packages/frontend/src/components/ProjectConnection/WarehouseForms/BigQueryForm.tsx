import {
    BigqueryAuthenticationType,
    FeatureFlags,
    ProjectMemberRole,
    ProjectMemberRoleLabels,
    WarehouseTypes,
} from '@lightdash/common';
import {
    TextInput,
    Anchor,
    Autocomplete,
    Badge,
    Button,
    Checkbox,
    FileInput,
    Group,
    Image,
    Loader,
    type ComboboxItem,
    type OptionsFilter,
    Stack,
    Text,
    Select,
    Switch,
    Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCheck, IconExclamationCircle } from '@tabler/icons-react';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type FC,
    type ReactNode,
} from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';
import { useGoogleLoginPopup } from '../../../hooks/gdrive/useGdrive';
import {
    useBigqueryDatasets,
    useBigqueryProjectRecommendation,
    useBigqueryProjects,
    useIsBigQueryAuthenticated,
} from '../../../hooks/useBigquerySSO';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import { NumberInput } from '../../common/NumberInput';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useProjectFormContext } from '../useProjectFormContext';
import classes from './BigQueryForm.module.css';
import {
    getBigqueryDefaultAuthenticationType,
    largestDatasetName,
} from './bigQuerySso';
import DataTimezoneField from './DataTimezoneField';
import { BigQueryDefaultValues } from './defaultValues';

const BigQuerySchemaDescription: FC = () => {
    const { t } = useTranslation('projectConnection');
    return (
        <p>
            <Trans
                t={t}
                i18nKey="warehouseFields.bigQueryDatasetDescription"
                components={{
                    b: <b />,
                    docsLink: (
                        <Anchor
                            inherit
                            target="_blank"
                            href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#:~:text=This%20connection%20method%20requires%20local%20OAuth%20via%20gcloud."
                            rel="noreferrer"
                        />
                    ),
                }}
            />
            <DocumentationHelpButton href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#data-set" />
        </p>
    );
};

export const BigQuerySchemaInput: FC<{
    disabled: boolean;
    description?: ReactNode;
}> = ({ disabled, description }) => {
    const { t } = useTranslation('projectConnection');
    const form = useFormContext();
    const { savedProject } = useProjectFormContext();
    const { data, error: bigqueryAuthError } = useIsBigQueryAuthenticated();
    const isAuthenticated = data !== undefined && bigqueryAuthError === null;
    const isSso =
        form.values.warehouse?.type === WarehouseTypes.BIGQUERY &&
        form.values.warehouse?.authenticationType ===
            BigqueryAuthenticationType.SSO;
    const isSavedBigquerySsoProject =
        savedProject?.warehouseConnection?.type === WarehouseTypes.BIGQUERY &&
        savedProject?.warehouseConnection?.authenticationType ===
            BigqueryAuthenticationType.SSO;
    const projectField = form.getInputProps('warehouse.project');
    const [debouncedProject] = useDebouncedValue(projectField.value, 300);
    const {
        data: datasets,
        isInitialLoading: isLoadingDatasets,
        error: datasetsError,
    } = useBigqueryDatasets(isAuthenticated && isSso, debouncedProject);
    const datasetField = form.getInputProps('warehouse.dataset');
    const hasProject =
        typeof debouncedProject === 'string' && debouncedProject.length > 0;
    const recommendedDataset = largestDatasetName(datasets ?? []);
    const hasAppliedRecommendation = useRef(false);

    useEffect(() => {
        hasAppliedRecommendation.current = false;
    }, [debouncedProject]);

    useEffect(() => {
        if (
            hasAppliedRecommendation.current ||
            !isSso ||
            !isAuthenticated ||
            datasetField.value ||
            !recommendedDataset
        ) {
            return;
        }
        hasAppliedRecommendation.current = true;
        const selectedDataset = datasets?.find(
            (dataset) => dataset.datasetId === recommendedDataset,
        );
        form.setFieldValue('warehouse.dataset', recommendedDataset);
        if (selectedDataset?.location) {
            form.setFieldValue('warehouse.location', selectedDataset.location);
        }
    }, [
        datasetField.value,
        datasets,
        form,
        isAuthenticated,
        isSso,
        recommendedDataset,
    ]);

    if (isSso && !isAuthenticated && !isSavedBigquerySsoProject) {
        return null;
    }

    if (!isSso || !isAuthenticated) {
        return (
            <TextInput
                name="warehouse.dataset"
                {...datasetField}
                label={t('warehouseFields.dataset')}
                description={description ?? <BigQuerySchemaDescription />}
                required
                disabled={disabled}
            />
        );
    }

    return (
        <Autocomplete
            name="warehouse.dataset"
            label={t('warehouseFields.dataset')}
            description={description ?? <BigQuerySchemaDescription />}
            placeholder={
                !hasProject
                    ? t('warehouseFields.chooseProjectFirst')
                    : isLoadingDatasets
                      ? t('warehouseFields.loadingDatasets')
                      : t('warehouseFields.selectDataset')
            }
            required
            {...datasetField}
            onChange={(value) => {
                datasetField.onChange(value);
                const selectedDataset = datasets?.find(
                    (dataset) => dataset.datasetId === value,
                );
                if (selectedDataset?.location) {
                    form.setFieldValue(
                        'warehouse.location',
                        selectedDataset.location,
                    );
                }
            }}
            disabled={disabled || !hasProject || isLoadingDatasets}
            data={datasets?.map((dataset) => dataset.datasetId) ?? []}
            renderOption={({ option }) => (
                <Group justify="space-between" wrap="nowrap" gap="xs" w="100%">
                    <Text size="sm" truncate="end">
                        {option.value}
                    </Text>
                    {option.value === recommendedDataset ? (
                        <Badge size="xs" color="green">
                            {t('warehouseFields.recommendedLargest')}
                        </Badge>
                    ) : null}
                </Group>
            )}
            maxDropdownHeight={220}
            rightSectionPointerEvents={datasetsError ? 'all' : 'none'}
            rightSection={
                isLoadingDatasets ? (
                    <Loader size="xs" />
                ) : datasetsError ? (
                    <Tooltip label={t('warehouseFields.datasetsLoadFailed')}>
                        <MantineIcon
                            icon={IconExclamationCircle}
                            color="yellow"
                        />
                    </Tooltip>
                ) : undefined
            }
        />
    );
};

export const BigQuerySSOInput: FC<{
    isAuthenticated: boolean;
    disabled: boolean;
    openLoginPopup: () => void;
}> = ({ isAuthenticated, disabled, openLoginPopup }) => {
    const { t } = useTranslation('projectConnection');
    if (isAuthenticated) return null;

    // Similar to ThirdPartySignInButton
    return (
        <>
            <Button
                onClick={() => {
                    openLoginPopup();
                }}
                variant="default"
                color="gray"
                disabled={disabled}
                leftSection={
                    <Image
                        w={16}
                        src={
                            'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJNMTcuNiA5LjJsLS4xLTEuOEg5djMuNGg0LjhDMTMuNiAxMiAxMyAxMyAxMiAxMy42djIuMmgzYTguOCA4LjggMCAwIDAgMi42LTYuNnoiIGZpbGw9IiM0Mjg1RjQiIGZpbGwtcnVsZT0ibm9uemVybyIvPjxwYXRoIGQ9Ik05IDE4YzIuNCAwIDQuNS0uOCA2LTIuMmwtMy0yLjJhNS40IDUuNCAwIDAgMS04LTIuOUgxVjEzYTkgOSAwIDAgMCA4IDV6IiBmaWxsPSIjMzRBODUzIiBmaWxsLXJ1bGU9Im5vbnplcm8iLz48cGF0aCBkPSJNNCAxMC43YTUuNCA1LjQgMCAwIDEgMC0zLjRWNUgxYTkgOSAwIDAgMCAwIDhsMy0yLjN6IiBmaWxsPSIjRkJCQzA1IiBmaWxsLXJ1bGU9Im5vbnplcm8iLz48cGF0aCBkPSJNOSAzLjZjMS4zIDAgMi41LjQgMy40IDEuM0wxNSAyLjNBOSA5IDAgMCAwIDEgNWwzIDIuNGE1LjQgNS40IDAgMCAxIDUtMy43eiIgZmlsbD0iI0VBNDMzNSIgZmlsbC1ydWxlPSJub256ZXJvIi8+PHBhdGggZD0iTTAgMGgxOHYxOEgweiIvPjwvZz48L3N2Zz4='
                        }
                        alt={t('warehouseFields.googleLogo')}
                    />
                }
                className={classes.signInButton}
            >
                {t('warehouseFields.signInGoogle')}
            </Button>
        </>
    );
};

const BigQueryForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { t } = useTranslation('projectConnection');
    const {
        data,
        error: bigqueryAuthError,
        refetch: refetchAuth,
    } = useIsBigQueryAuthenticated();
    const isAuthenticated = data !== undefined && bigqueryAuthError === null;
    const form = useFormContext();
    const project = form.getInputProps('warehouse.project');
    const hasAppliedProjectRecommendation = useRef(false);
    const [debouncedProject] = useDebouncedValue(project.value, 300);
    const { savedProject } = useProjectFormContext();
    const { health } = useApp();
    const isAdcEnabled = health.data?.auth.google?.enableGCloudADC;
    const isGoogleSsoAvailable = health.data?.auth.google?.enabled ?? false;
    // Fetching databases can only happen if user is authenticated
    // if user authenticates, and change to private_key
    // We will not make any queries, in case private_key is different
    const isSso =
        form.values.warehouse?.type === WarehouseTypes.BIGQUERY &&
        form.values.warehouse?.authenticationType ===
            BigqueryAuthenticationType.SSO;
    const {
        data: datasets,
        isInitialLoading: isLoadingDatasets,
        refetch: refetchDatasets,
        error: datasetsError,
    } = useBigqueryDatasets(isAuthenticated && isSso, debouncedProject);
    const {
        data: gcpProjects,
        isLoading: isLoadingProjects,
        error: projectsError,
    } = useBigqueryProjects(isAuthenticated && isSso);
    const shouldFetchProjectRecommendation =
        isAuthenticated &&
        isSso &&
        !savedProject &&
        !project.value &&
        !hasAppliedProjectRecommendation.current;
    const {
        data: projectRecommendation,
        isInitialLoading: isLoadingProjectRecommendation,
    } = useBigqueryProjectRecommendation(shouldFetchProjectRecommendation);
    const [isOpen, toggleOpen] = useToggle(false);
    const [temporaryFile, setTemporaryFile] = useState<File | null>(null);
    const requireSecrets: boolean = !(
        savedProject?.warehouseConnection?.type === WarehouseTypes.BIGQUERY &&
        savedProject?.warehouseConnection?.authenticationType ===
            BigqueryAuthenticationType.PRIVATE_KEY
    );
    const hasDatasets = datasets && datasets.length > 0;
    const executionProjectField = form.getInputProps(
        'warehouse.executionProject',
    );
    const accessUrlField = form.getInputProps('warehouse.accessUrl');
    if (form.values.warehouse?.type !== WarehouseTypes.BIGQUERY) {
        throw new Error('Bigquery form is not used for this warehouse type');
    }

    const isSavedBigquerySsoProject =
        savedProject?.warehouseConnection?.type === WarehouseTypes.BIGQUERY &&
        savedProject?.warehouseConnection?.authenticationType ===
            BigqueryAuthenticationType.SSO;
    const showWarehouseConfigFields =
        !isSso || isAuthenticated || isSavedBigquerySsoProject;

    // savedProject might not be loaded when the form is rendered, so we need to set the defaultValue also on a hook
    const defaultAuthenticationType =
        getBigqueryDefaultAuthenticationType(isGoogleSsoAvailable);

    const warehouseConnectFlag = useServerFeatureFlag(
        FeatureFlags.NewOnboarding,
    );
    const shouldDefaultToSso =
        !savedProject &&
        (warehouseConnectFlag.data?.enabled ?? false) &&
        isGoogleSsoAvailable;
    useEffect(() => {
        if (shouldDefaultToSso && !form.isTouched()) {
            form.setFieldValue(
                'warehouse.authenticationType',
                BigqueryAuthenticationType.SSO,
            );
        }
    }, [shouldDefaultToSso, form]);

    useEffect(() => {
        if (
            hasAppliedProjectRecommendation.current ||
            !isAuthenticated ||
            !isSso ||
            savedProject ||
            projectRecommendation === undefined
        ) {
            return;
        }
        hasAppliedProjectRecommendation.current = true;
        if (!project.value && projectRecommendation.projectId) {
            form.setFieldValue(
                'warehouse.project',
                projectRecommendation.projectId,
            );
        }
    }, [
        form,
        isAuthenticated,
        isSso,
        project.value,
        projectRecommendation,
        savedProject,
    ]);

    const { track } = useTracking();
    const { mutate: openLoginPopup } = useGoogleLoginPopup(
        'bigquery',
        async () => {
            await refetchAuth();
            await refetchDatasets();
            track({
                name: EventName.BIGQUERY_SSO_SIGNIN_COMPLETED,
                properties: { success: true },
            });
        },
    );
    const handleBigQuerySsoSignIn = () => {
        track({ name: EventName.BIGQUERY_SSO_SIGNIN_CLICKED });
        openLoginPopup(undefined, {
            onError: () => {
                track({
                    name: EventName.BIGQUERY_SSO_SIGNIN_COMPLETED,
                    properties: { success: false },
                });
            },
        });
    };
    const authenticationType: string =
        form.values.warehouse.authenticationType ?? defaultAuthenticationType;
    const locationField = form.getInputProps('warehouse.location');
    const hasProjectValue =
        typeof project.value === 'string' && project.value.length > 0;
    const projectOptionsFilter = useMemo<OptionsFilter>(() => {
        const friendlyNames = new Map(
            gcpProjects?.map((p) => [
                p.projectId,
                (p.friendlyName ?? '').toLowerCase(),
            ]) ?? [],
        );
        return ({ options, search }) => {
            const items = options as ComboboxItem[];
            const trimmed = search.trim().toLowerCase();
            const isExistingValue = items.some((item) => item.value === search);
            if (!trimmed || isExistingValue) {
                return items;
            }
            return items.filter(
                (item) =>
                    item.value.toLowerCase().includes(trimmed) ||
                    (friendlyNames.get(item.value) ?? '').includes(trimmed),
            );
        };
    }, [gcpProjects]);
    const isLocationLoading =
        isSso &&
        isAuthenticated &&
        !locationField.value &&
        (isLoadingProjectRecommendation ||
            isLoadingDatasets ||
            (hasProjectValue && !datasets && !datasetsError));

    const onChangeFactory =
        (onChange: (value: string | undefined) => void) =>
        (e: ChangeEvent<HTMLInputElement>) => {
            onChange(e.target.value === '' ? undefined : e.target.value);
        };
    const authenticationTypes = [
        {
            value: BigqueryAuthenticationType.PRIVATE_KEY,
            label: t('warehouseFields.serviceAccount'),
        },
        (isGoogleSsoAvailable || isSavedBigquerySsoProject) && {
            value: BigqueryAuthenticationType.SSO,
            label: t('warehouseFields.userAccountGoogle'),
        },
        isAdcEnabled && {
            value: BigqueryAuthenticationType.ADC,
            label: t('warehouseFields.applicationDefaultCredentials'),
        },
    ].filter(Boolean) as ComboboxItem[];
    return (
        <>
            <Stack mt={8}>
                {
                    <Group gap="sm" align="flex-end">
                        <Select
                            allowDeselect={false}
                            name="warehouse.authenticationType"
                            {...form.getInputProps(
                                'warehouse.authenticationType',
                            )}
                            defaultValue={defaultAuthenticationType}
                            label={t('warehouseFields.authenticationType')}
                            description={
                                isAuthenticated ? (
                                    <Text mt="0" c="gray" fs="xs">
                                        {t('warehouseFields.connectedTo', {
                                            warehouse: 'BigQuery',
                                        })}{' '}
                                        <Anchor
                                            inherit
                                            href="#"
                                            onClick={() => {
                                                openLoginPopup();
                                            }}
                                        >
                                            {t(
                                                'warehouseFields.reauthenticate',
                                            )}
                                        </Anchor>
                                    </Text>
                                ) : (
                                    t(
                                        'warehouseFields.bigQueryAuthenticationDescription',
                                    )
                                )
                            }
                            data={authenticationTypes}
                            required
                            disabled={disabled}
                            w={isAuthenticated ? '90%' : '100%'}
                        />
                        {isAuthenticated && (
                            <Tooltip
                                label={t('warehouseFields.connectedBigQuery')}
                            >
                                <Group mb={10}>
                                    <MantineIcon
                                        icon={IconCheck}
                                        color="green"
                                    />
                                </Group>
                            </Tooltip>
                        )}
                    </Group>
                }

                {authenticationType === BigqueryAuthenticationType.SSO && (
                    <BigQuerySSOInput
                        isAuthenticated={isAuthenticated}
                        disabled={disabled}
                        openLoginPopup={handleBigQuerySsoSignIn}
                    />
                )}
                {showWarehouseConfigFields && (
                    <>
                        <Group gap="sm" align="flex-end">
                            {isSso && isAuthenticated ? (
                                <Autocomplete
                                    name="warehouse.project"
                                    label={t('warehouseFields.project')}
                                    filter={projectOptionsFilter}
                                    description={
                                        <p>
                                            <Anchor
                                                inherit
                                                target="_blank"
                                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#project"
                                                rel="noreferrer"
                                            >
                                                {t(
                                                    'warehouseFields.gcpProjectId',
                                                )}
                                            </Anchor>
                                            .
                                        </p>
                                    }
                                    placeholder={
                                        isLoadingProjects ||
                                        isLoadingProjectRecommendation
                                            ? t(
                                                  'warehouseFields.loadingProjects',
                                              )
                                            : t('warehouseFields.selectProject')
                                    }
                                    required
                                    {...project}
                                    onChange={(value) => {
                                        hasAppliedProjectRecommendation.current = true;
                                        project.onChange(value);
                                    }}
                                    disabled={
                                        disabled ||
                                        isLoadingProjects ||
                                        isLoadingProjectRecommendation
                                    }
                                    labelProps={{ style: { marginTop: '8px' } }}
                                    w={hasDatasets ? '90%' : '100%'}
                                    data={
                                        gcpProjects?.map((p) => p.projectId) ??
                                        []
                                    }
                                    maxDropdownHeight={220}
                                    renderOption={({ option }) => {
                                        const projectOption = gcpProjects?.find(
                                            (projectItem) =>
                                                projectItem.projectId ===
                                                option.value,
                                        );

                                        return (
                                            <Group
                                                justify="space-between"
                                                wrap="nowrap"
                                                gap="xs"
                                                w="100%"
                                            >
                                                <Text size="sm" truncate="end">
                                                    {projectOption?.friendlyName
                                                        ? `${projectOption.friendlyName} (${projectOption.projectId})`
                                                        : option.value}
                                                </Text>
                                                {option.value ===
                                                projectRecommendation?.projectId ? (
                                                    <Badge
                                                        size="xs"
                                                        color="green"
                                                    >
                                                        {t(
                                                            'warehouseFields.recommendedLargest',
                                                        )}
                                                    </Badge>
                                                ) : null}
                                            </Group>
                                        );
                                    }}
                                    rightSectionPointerEvents={
                                        projectsError ? 'all' : 'none'
                                    }
                                    rightSection={
                                        isLoadingProjects ||
                                        isLoadingProjectRecommendation ? (
                                            <Loader size="xs" />
                                        ) : projectsError ? (
                                            <Tooltip
                                                label={t(
                                                    'warehouseFields.projectsLoadFailed',
                                                )}
                                            >
                                                <MantineIcon
                                                    icon={IconExclamationCircle}
                                                    color="yellow"
                                                />
                                            </Tooltip>
                                        ) : undefined
                                    }
                                    error={
                                        datasetsError ? (
                                            <Text c="red">
                                                {datasetsError.error.message}
                                            </Text>
                                        ) : undefined
                                    }
                                />
                            ) : (
                                <TextInput
                                    name="warehouse.project"
                                    label={t('warehouseFields.project')}
                                    description={
                                        <p>
                                            <Anchor
                                                inherit
                                                target="_blank"
                                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#project"
                                                rel="noreferrer"
                                            >
                                                {t(
                                                    'warehouseFields.gcpProjectId',
                                                )}
                                            </Anchor>
                                            .
                                        </p>
                                    }
                                    required
                                    {...form.getInputProps('warehouse.project')}
                                    disabled={disabled}
                                    labelProps={{ style: { marginTop: '8px' } }}
                                    w={hasDatasets ? '90%' : '100%'}
                                    error={
                                        datasetsError ? (
                                            <Text c="red">
                                                {datasetsError.error.message}
                                            </Text>
                                        ) : undefined
                                    }
                                />
                            )}
                            {hasDatasets && (
                                <Tooltip
                                    label={t('warehouseFields.projectAccess')}
                                >
                                    <Group mb={10}>
                                        <MantineIcon
                                            icon={IconCheck}
                                            color="green"
                                        />
                                    </Group>
                                </Tooltip>
                            )}
                        </Group>

                        <TextInput
                            name="warehouse.location"
                            label={t('warehouseFields.location')}
                            description={
                                <p>
                                    <Trans
                                        t={t}
                                        i18nKey="warehouseFields.bigQueryLocationDescription"
                                        components={{
                                            docsLink: (
                                                <Anchor
                                                    inherit
                                                    target="_blank"
                                                    href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#dataset-locations"
                                                    rel="noreferrer"
                                                />
                                            ),
                                        }}
                                    />
                                </p>
                            }
                            {...locationField}
                            onChange={onChangeFactory(locationField.onChange)}
                            placeholder={
                                isLocationLoading
                                    ? t('warehouseFields.detectingLocation')
                                    : undefined
                            }
                            disabled={disabled || isLocationLoading}
                            rightSectionPointerEvents="none"
                            rightSection={
                                isLocationLoading ? (
                                    <Loader size="xs" />
                                ) : undefined
                            }
                        />

                        {authenticationType ===
                        BigqueryAuthenticationType.SSO ? (
                            <></>
                        ) : authenticationType ===
                          BigqueryAuthenticationType.PRIVATE_KEY ? (
                            <>
                                <FileInput
                                    name="warehouse.keyfileContents"
                                    {...form.getInputProps(
                                        'warehouse.keyfileContents',
                                        {
                                            withError: true,
                                        },
                                    )}
                                    label={t('warehouseFields.keyFile')}
                                    placeholder={
                                        !requireSecrets
                                            ? '**************'
                                            : t('warehouseFields.chooseFile')
                                    }
                                    description={
                                        <p>
                                            <Trans
                                                t={t}
                                                i18nKey="warehouseFields.keyFileDescription"
                                                components={{
                                                    docsLink: (
                                                        <Anchor
                                                            inherit
                                                            target="_blank"
                                                            href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#key-file"
                                                            rel="noreferrer"
                                                        />
                                                    ),
                                                }}
                                            />
                                        </p>
                                    }
                                    required={requireSecrets}
                                    accept="application/json"
                                    value={temporaryFile}
                                    onChange={(file) => {
                                        if (!file) {
                                            form.setFieldValue(
                                                'warehouse.keyfileContents',
                                                BigQueryDefaultValues.keyfileContents,
                                            );
                                            return;
                                        }

                                        const fileReader = new FileReader();
                                        fileReader.onload = function (event) {
                                            const contents =
                                                event.target?.result;

                                            if (typeof contents === 'string') {
                                                try {
                                                    setTemporaryFile(file);
                                                    form.setFieldValue(
                                                        'warehouse.keyfileContents',
                                                        JSON.parse(contents),
                                                    );
                                                } catch (error) {
                                                    // 🤷‍♂️
                                                    setTimeout(() => {
                                                        form.setFieldError(
                                                            'warehouse.keyfileContents',
                                                            t(
                                                                'warehouseFields.invalidJsonFile',
                                                            ),
                                                        );
                                                    });

                                                    form.setFieldValue(
                                                        'warehouse.keyfileContents',
                                                        BigQueryDefaultValues.keyfileContents,
                                                    );
                                                }
                                            } else {
                                                form.setFieldValue(
                                                    'warehouse.keyfileContents',
                                                    BigQueryDefaultValues.keyfileContents,
                                                );
                                                setTemporaryFile(null);
                                            }
                                        };
                                        fileReader.readAsText(file);
                                    }}
                                    disabled={disabled}
                                />
                            </>
                        ) : (
                            /* BigqueryAuthenticationType.ADC */
                            <></>
                        )}
                        <FormSection isOpen={isOpen} name="advanced">
                            <Stack mt={8}>
                                <Switch
                                    name="warehouse.requireUserCredentials"
                                    {...form.getInputProps(
                                        'warehouse.requireUserCredentials',
                                        {
                                            type: 'checkbox',
                                        },
                                    )}
                                    label={t(
                                        'warehouseFields.requireUserCredentials',
                                    )}
                                    disabled={disabled}
                                    defaultChecked={
                                        BigQueryDefaultValues.requireUserCredentials
                                    }
                                />
                                <Checkbox
                                    name="warehouse.allowUserCredentials"
                                    {...form.getInputProps(
                                        'warehouse.allowUserCredentials',
                                        { type: 'checkbox' },
                                    )}
                                    label={t(
                                        'warehouseFields.usePersonalCredentials',
                                    )}
                                    description={t(
                                        'warehouseFields.usePersonalCredentialsDescription',
                                    )}
                                    checked={
                                        !!form.values.warehouse
                                            .requireUserCredentials ||
                                        (form.values.warehouse.type ===
                                            WarehouseTypes.BIGQUERY &&
                                            !!form.values.warehouse
                                                .allowUserCredentials)
                                    }
                                    disabled={
                                        disabled ||
                                        !!form.values.warehouse
                                            .requireUserCredentials
                                    }
                                />

                                <TextInput
                                    name="warehouse.executionProject"
                                    label={t(
                                        'warehouseFields.executionProject',
                                    )}
                                    description={
                                        <p>
                                            <Trans
                                                t={t}
                                                i18nKey="warehouseFields.executionProjectDescription"
                                                components={{
                                                    docsLink: (
                                                        <Anchor
                                                            inherit
                                                            target="_blank"
                                                            href="https://docs.getdbt.com/docs/core/connect-data-platform/bigquery-setup#execution-project"
                                                            rel="noreferrer"
                                                        />
                                                    ),
                                                }}
                                            />
                                        </p>
                                    }
                                    {...executionProjectField}
                                    onChange={onChangeFactory(
                                        executionProjectField.onChange,
                                    )}
                                    disabled={disabled}
                                />
                                <TextInput
                                    name="warehouse.accessUrl"
                                    label={t(
                                        'warehouseFields.bigQueryUrlOverride',
                                    )}
                                    placeholder="e.g. https://bigquery.googleapis.com"
                                    description={
                                        <p>
                                            {t(
                                                'warehouseFields.bigQueryUrlOverrideDescription',
                                            )}
                                        </p>
                                    }
                                    {...accessUrlField}
                                    onChange={onChangeFactory(
                                        accessUrlField.onChange,
                                    )}
                                    disabled={disabled}
                                />

                                <NumberInput
                                    name="warehouse.timeoutSeconds"
                                    {...form.getInputProps(
                                        'warehouse.timeoutSeconds',
                                    )}
                                    label={t('warehouseFields.timeoutSeconds')}
                                    defaultValue={
                                        BigQueryDefaultValues.timeoutSeconds
                                    }
                                    description={
                                        <p>
                                            <Trans
                                                t={t}
                                                i18nKey="warehouseFields.bigQueryTimeoutDescription"
                                                components={{
                                                    docsLink: (
                                                        <Anchor
                                                            inherit
                                                            target="_blank"
                                                            href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#timeouts"
                                                            rel="noreferrer"
                                                        />
                                                    ),
                                                }}
                                            />
                                        </p>
                                    }
                                    required
                                    disabled={disabled}
                                />

                                <Select
                                    allowDeselect={false}
                                    name="warehouse.priority"
                                    {...form.getInputProps(
                                        'warehouse.priority',
                                    )}
                                    defaultValue={
                                        BigQueryDefaultValues.priority
                                    }
                                    label={t('warehouseFields.priority')}
                                    description={
                                        <p>
                                            <Trans
                                                t={t}
                                                i18nKey="warehouseFields.priorityDescription"
                                                components={{
                                                    docsLink: (
                                                        <Anchor
                                                            inherit
                                                            target="_blank"
                                                            href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#priority"
                                                            rel="noreferrer"
                                                        />
                                                    ),
                                                }}
                                            />
                                        </p>
                                    }
                                    data={[
                                        {
                                            value: 'interactive',
                                            label: 'interactive',
                                        },
                                        {
                                            value: 'batch',
                                            label: 'batch',
                                        },
                                    ]}
                                    required
                                    disabled={disabled}
                                />

                                <NumberInput
                                    name="warehouse.retries"
                                    {...form.getInputProps('warehouse.retries')}
                                    defaultValue={BigQueryDefaultValues.retries}
                                    label={t('warehouseFields.retries')}
                                    description={
                                        <p>
                                            <Trans
                                                t={t}
                                                i18nKey="warehouseFields.bigQueryRetriesDescription"
                                                components={{
                                                    docsLink: (
                                                        <Anchor
                                                            inherit
                                                            target="_blank"
                                                            href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#retries"
                                                            rel="noreferrer"
                                                        />
                                                    ),
                                                }}
                                            />
                                        </p>
                                    }
                                    required
                                />

                                <NumberInput
                                    name="warehouse.maximumBytesBilled"
                                    {...form.getInputProps(
                                        'warehouse.maximumBytesBilled',
                                    )}
                                    defaultValue={
                                        BigQueryDefaultValues.maximumBytesBilled
                                    }
                                    label={t(
                                        'warehouseFields.maximumBytesBilled',
                                    )}
                                    description={
                                        <p>
                                            <Trans
                                                t={t}
                                                i18nKey="warehouseFields.maximumBytesBilledDescription"
                                                components={{
                                                    docsLink: (
                                                        <Anchor
                                                            inherit
                                                            target="_blank"
                                                            href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#maximum-bytes-billed"
                                                            rel="noreferrer"
                                                        />
                                                    ),
                                                }}
                                            />
                                        </p>
                                    }
                                    disabled={disabled}
                                />

                                <Stack gap="xs">
                                    <Text size="sm" fw={500}>
                                        {t(
                                            'warehouseFields.maximumBytesBilledByRole',
                                        )}
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        {t(
                                            'warehouseFields.maximumBytesBilledByRoleDescription',
                                        )}
                                    </Text>
                                    {Object.values(ProjectMemberRole).map(
                                        (role) => {
                                            const path = `warehouse.maximumBytesBilledByRole.${role}`;
                                            return (
                                                <NumberInput
                                                    key={role}
                                                    name={path}
                                                    label={
                                                        ProjectMemberRoleLabels[
                                                            role
                                                        ]
                                                    }
                                                    min={0}
                                                    value={
                                                        form.getInputProps(path)
                                                            .value ?? ''
                                                    }
                                                    onNumberChange={(value) =>
                                                        form.setFieldValue(
                                                            path,
                                                            value,
                                                        )
                                                    }
                                                    disabled={disabled}
                                                />
                                            );
                                        },
                                    )}
                                </Stack>

                                <NumberInput
                                    name="warehouse.agentMaximumBytesBilled"
                                    label={t(
                                        'warehouseFields.aiAgentMaxBytesBilled',
                                    )}
                                    description={t(
                                        'warehouseFields.aiAgentMaxBytesBilledDescription',
                                    )}
                                    min={0}
                                    value={
                                        form.getInputProps(
                                            'warehouse.agentMaximumBytesBilled',
                                        ).value ?? ''
                                    }
                                    onNumberChange={(value) =>
                                        form.setFieldValue(
                                            'warehouse.agentMaximumBytesBilled',
                                            value,
                                        )
                                    }
                                    disabled={disabled}
                                />

                                <Switch
                                    name="warehouse.estimateQueryBytes"
                                    {...form.getInputProps(
                                        'warehouse.estimateQueryBytes',
                                        { type: 'checkbox' },
                                    )}
                                    label={t(
                                        'warehouseFields.showQueryCostEstimates',
                                    )}
                                    description={t(
                                        'warehouseFields.showQueryCostEstimatesDescription',
                                    )}
                                    disabled={disabled}
                                />

                                <NumberInput
                                    name="warehouse.confirmEstimatedBytesAbove"
                                    {...form.getInputProps(
                                        'warehouse.confirmEstimatedBytesAbove',
                                    )}
                                    label={t(
                                        'warehouseFields.confirmQueriesAbove',
                                    )}
                                    description={t(
                                        'warehouseFields.confirmQueriesAboveDescription',
                                    )}
                                    disabled={
                                        disabled ||
                                        !(
                                            form.values.warehouse.type ===
                                                WarehouseTypes.BIGQUERY &&
                                            form.values.warehouse
                                                .estimateQueryBytes
                                        )
                                    }
                                />

                                <NumberInput
                                    name="warehouse.agentMaximumEstimatedBytes"
                                    {...form.getInputProps(
                                        'warehouse.agentMaximumEstimatedBytes',
                                    )}
                                    label={t(
                                        'warehouseFields.aiAgentQueryLimit',
                                    )}
                                    description={t(
                                        'warehouseFields.aiAgentQueryLimitDescription',
                                    )}
                                    disabled={disabled}
                                />

                                <DataTimezoneField disabled={disabled} />
                                <StartOfWeekSelect disabled={disabled} />
                            </Stack>
                        </FormSection>
                        <FormCollapseButton
                            isSectionOpen={isOpen}
                            onClick={toggleOpen}
                        >
                            {t('dbtSettings.advancedOptions')}
                        </FormCollapseButton>
                    </>
                )}
            </Stack>
        </>
    );
};

export default BigQueryForm;
