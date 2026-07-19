import {
    BigqueryAuthenticationType,
    FeatureFlags,
    WarehouseTypes,
} from '@lightdash/common';
import {
    TextInput,
    Anchor,
    Autocomplete,
    Badge,
    Button,
    FileInput,
    Group,
    Image,
    Loader,
    type ComboboxItem,
    Stack,
    Text,
    Select,
    Switch,
} from '@mantine-8/core';
import { NumberInput, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCheck, IconExclamationCircle } from '@tabler/icons-react';
import {
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type FC,
    type ReactNode,
} from 'react';
import { useToggle } from 'react-use';
import { useGoogleLoginPopup } from '../../../hooks/gdrive/useGdrive';
import useHealth from '../../../hooks/health/useHealth';
import {
    useBigqueryDatasets,
    useBigqueryProjectRecommendation,
    useBigqueryProjects,
    useIsBigQueryAuthenticated,
} from '../../../hooks/useBigquerySSO';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useProjectFormContext } from '../useProjectFormContext';
import classes from './BigQueryForm.module.css';
import { largestDatasetName } from './bigQuerySso';
import DataTimezoneField from './DataTimezoneField';
import { BigQueryDefaultValues } from './defaultValues';

const bigQuerySchemaDescription = (
    <p>
        This is the name of your dbt dataset: the dataset in your warehouse
        where the output of your dbt models is written to. If you're not sure
        what this is, check out the
        <b> dataset </b>
        value{' '}
        <Anchor
            inherit
            target="_blank"
            href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#:~:text=This%20connection%20method%20requires%20local%20OAuth%20via%20gcloud."
            rel="noreferrer"
        >
            you've set in your dbt <b>profiles.yml</b> file
        </Anchor>
        .
        <DocumentationHelpButton href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#data-set" />
    </p>
);

export const BigQuerySchemaInput: FC<{
    disabled: boolean;
    description?: ReactNode;
}> = ({ disabled, description }) => {
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
                label="Data set"
                description={description ?? bigQuerySchemaDescription}
                required
                disabled={disabled}
            />
        );
    }

    return (
        <Autocomplete
            name="warehouse.dataset"
            label="Data set"
            description={description ?? bigQuerySchemaDescription}
            placeholder={
                !hasProject
                    ? 'Choose a project first'
                    : isLoadingDatasets
                      ? 'Loading data sets...'
                      : 'Type or select a data set'
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
                        <Badge
                            size="xs"
                            color="green"
                            variant="light"
                            radius="sm"
                        >
                            Recommended · largest
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
                    <Tooltip label="Failed to load data sets. You can type manually.">
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

const BigQuerySSOInput: FC<{
    isAuthenticated: boolean;
    disabled: boolean;
    openLoginPopup: () => void;
}> = ({ isAuthenticated, disabled, openLoginPopup }) => {
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
                        alt="Google logo"
                    />
                }
                className={classes.signInButton}
            >
                Sign in with Google
            </Button>
        </>
    );
};

const BigQueryForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
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
    const health = useHealth();
    const isAdcEnabled = health.data?.auth.google?.enableGCloudADC;
    // Fetching databases can only happen if user is authenticated
    // if user authenticates, and change to private_key
    // We will not make any queries, in case private_key is different
    const isSso =
        form.values.warehouse?.type === WarehouseTypes.BIGQUERY &&
        form.values.warehouse?.authenticationType ===
            BigqueryAuthenticationType.SSO;
    const {
        data: datasets,
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
    const defaultAuthenticationType = BigqueryAuthenticationType.SSO;

    const warehouseConnectFlag = useServerFeatureFlag(
        FeatureFlags.NewOnboarding,
    );
    const shouldDefaultToSso =
        !savedProject && (warehouseConnectFlag.data?.enabled ?? false);
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

    const onChangeFactory =
        (onChange: (value: string | undefined) => void) =>
        (e: ChangeEvent<HTMLInputElement>) => {
            onChange(e.target.value === '' ? undefined : e.target.value);
        };
    const authenticationTypes = [
        {
            value: BigqueryAuthenticationType.PRIVATE_KEY,
            label: 'Service Account (JSON key file)',
        },
        {
            value: BigqueryAuthenticationType.SSO,
            label: 'User Account (Sign in with Google)',
        },
        isAdcEnabled && {
            value: BigqueryAuthenticationType.ADC,
            label: 'Application Default Credentials',
        },
    ].filter(Boolean) as ComboboxItem[];
    return (
        <>
            <Stack mt={8}>
                {
                    <Group gap="sm">
                        <Select
                            allowDeselect={false}
                            name="warehouse.authenticationType"
                            {...form.getInputProps(
                                'warehouse.authenticationType',
                            )}
                            defaultValue={defaultAuthenticationType}
                            label="Authentication Type"
                            description={
                                isAuthenticated ? (
                                    <Text mt="0" c="gray" fs="xs">
                                        You are connected to BigQuery,{' '}
                                        <Anchor
                                            inherit
                                            href="#"
                                            onClick={() => {
                                                openLoginPopup();
                                            }}
                                        >
                                            Click here to reauthenticate.
                                        </Anchor>
                                    </Text>
                                ) : (
                                    'Choose whether to authenticate with a service account or a user account'
                                )
                            }
                            data={authenticationTypes}
                            required
                            disabled={disabled}
                            w={isAuthenticated ? '90%' : '100%'}
                        />
                        {isAuthenticated && (
                            <Tooltip label="You are connected to BigQuery">
                                <Group mt="40px">
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
                        <Group gap="sm">
                            {isSso && isAuthenticated ? (
                                <Autocomplete
                                    name="warehouse.project"
                                    label="Project"
                                    description={
                                        <p>
                                            <Anchor
                                                inherit
                                                target="_blank"
                                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#project"
                                                rel="noreferrer"
                                            >
                                                This is the GCP project ID
                                            </Anchor>
                                            .
                                        </p>
                                    }
                                    placeholder={
                                        isLoadingProjects ||
                                        isLoadingProjectRecommendation
                                            ? 'Loading projects...'
                                            : 'Type or select a project'
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
                                                        variant="light"
                                                        radius="sm"
                                                    >
                                                        Recommended · largest
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
                                            <Tooltip label="Failed to load projects. You can type manually.">
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
                                    label="Project"
                                    description={
                                        <p>
                                            <Anchor
                                                inherit
                                                target="_blank"
                                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#project"
                                                rel="noreferrer"
                                            >
                                                This is the GCP project ID
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
                                <Tooltip label="You have access to this project">
                                    <Group mt="50px">
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
                            label="Location"
                            description={
                                <p>
                                    The location of BigQuery datasets. You can
                                    see more details in{' '}
                                    <Anchor
                                        inherit
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#dataset-locations"
                                        rel="noreferrer"
                                    >
                                        dbt documentation
                                    </Anchor>
                                    .
                                </p>
                            }
                            {...locationField}
                            onChange={onChangeFactory(locationField.onChange)}
                            disabled={disabled}
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
                                    label="Key File"
                                    placeholder={
                                        !requireSecrets
                                            ? '**************'
                                            : 'Choose file...'
                                    }
                                    description={
                                        <p>
                                            This is the JSON key file. You can
                                            see{' '}
                                            <Anchor
                                                inherit
                                                target="_blank"
                                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#key-file"
                                                rel="noreferrer"
                                            >
                                                how to create a key here
                                            </Anchor>
                                            .
                                        </p>
                                    }
                                    required={requireSecrets}
                                    accept="application/json"
                                    value={temporaryFile}
                                    onChange={(file) => {
                                        if (!file) {
                                            form.setFieldValue(
                                                'warehouse.keyfileContents',
                                                null,
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
                                                            'Invalid JSON file',
                                                        );
                                                    });

                                                    form.setFieldValue(
                                                        'warehouse.keyfileContents',
                                                        null,
                                                    );
                                                }
                                            } else {
                                                form.setFieldValue(
                                                    'warehouse.keyfileContents',
                                                    null,
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
                                    label="Require users to provide their own credentials"
                                    disabled={disabled}
                                    defaultChecked={
                                        BigQueryDefaultValues.requireUserCredentials
                                    }
                                />

                                <TextInput
                                    name="warehouse.executionProject"
                                    label="Execution project"
                                    description={
                                        <p>
                                            You may specify a project to bill
                                            for query execution, instead of the
                                            project/database where you
                                            materialize most resources. You can
                                            see more details in{' '}
                                            <Anchor
                                                inherit
                                                target="_blank"
                                                href="https://docs.getdbt.com/docs/core/connect-data-platform/bigquery-setup#execution-project"
                                                rel="noreferrer"
                                            >
                                                dbt documentation
                                            </Anchor>
                                            .
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
                                    label="BigQuery URL override"
                                    placeholder="e.g. https://bigquery.googleapis.com"
                                    description={
                                        <p>
                                            Override the default BigQuery API
                                            endpoint. This is useful for Private
                                            Service Connect, custom proxies, or
                                            local emulators.
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
                                    label="Timeout in seconds"
                                    defaultValue={
                                        BigQueryDefaultValues.timeoutSeconds
                                    }
                                    description={
                                        <p>
                                            If a dbt model takes longer than
                                            this timeout to complete, then
                                            BigQuery may cancel the query. You
                                            can see more details in{' '}
                                            <Anchor
                                                inherit
                                                target="_blank"
                                                href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#timeouts"
                                                rel="noreferrer"
                                            >
                                                dbt documentation
                                            </Anchor>
                                            .
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
                                    label="Priority"
                                    description={
                                        <p>
                                            The priority for the BigQuery jobs
                                            that dbt executes. You can see more
                                            details in{' '}
                                            <Anchor
                                                inherit
                                                target="_blank"
                                                href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#priority"
                                                rel="noreferrer"
                                            >
                                                dbt documentation
                                            </Anchor>
                                            .
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
                                    label="Retries"
                                    description={
                                        <p>
                                            The number of times dbt should retry
                                            queries that result in unhandled
                                            server errors You can see more
                                            details in{' '}
                                            <Anchor
                                                inherit
                                                target="_blank"
                                                href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#retries"
                                                rel="noreferrer"
                                            >
                                                dbt documentation
                                            </Anchor>
                                            .
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
                                    label="Maximum bytes billed"
                                    description={
                                        <p>
                                            When a value is configured, queries
                                            executed by dbt will fail if they
                                            exceed the configured maximum bytes
                                            threshold. You can see more details
                                            in{' '}
                                            <Anchor
                                                inherit
                                                target="_blank"
                                                href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#maximum-bytes-billed"
                                                rel="noreferrer"
                                            >
                                                dbt documentation
                                            </Anchor>
                                            . Leaving this field empty or with a
                                            0 value means no limit.
                                        </p>
                                    }
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
                            Advanced configuration options
                        </FormCollapseButton>
                    </>
                )}
            </Stack>
        </>
    );
};

export default BigQueryForm;
