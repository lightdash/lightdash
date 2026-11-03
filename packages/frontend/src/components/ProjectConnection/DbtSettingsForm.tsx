import {
    assertUnreachable,
    DbtProjectType,
    DbtProjectTypeLabels,
    WarehouseTypes,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Image,
    Select,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    UnstyledButton,
} from '@mantine/core';
import {
    IconBrandAzure,
    IconBrandBitbucket,
    IconBrandGithub,
    IconBrandGitlab,
} from '@tabler/icons-react';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import AzureDevOpsForm from './DbtForms/AzureDevOpsForm';
import BitBucketForm from './DbtForms/BitBucketForm';
import DbtCloudForm from './DbtForms/DbtCloudForm';
import DbtLocalForm from './DbtForms/DbtLocalForm';
import DbtManifestForm from './DbtForms/DbtManifestForm';
import DbtNoneForm from './DbtForms/DbtNoneForm';
import { dbtDefaults } from './DbtForms/defaultValues';
import GithubForm from './DbtForms/GithubForm';
import GitlabForm from './DbtForms/GitlabForm';
import { useAwaitingGithubSignIn } from './DbtForms/useAwaitingGithubSignIn';
import classes from './DbtSettingsForm.module.css';
import FormCollapseButton from './FormCollapseButton';
import { useFormContext } from './formContext';
import FormSection from './Inputs/FormSection';
import { MultiKeyValuePairsInput } from './Inputs/MultiKeyValuePairsInput';
import DbtLogo from './ProjectConnectFlow/Assets/dbt.svg';
import { useProjectFormContext } from './useProjectFormContext';
import WarehouseLocationInputs from './WarehouseLocationInputs';
import WarehouseSchemaInput from './WarehouseSchemaInput';

const SOURCE_TILES: { type: DbtProjectType; label: string; icon: ReactNode }[] =
    [
        {
            type: DbtProjectType.GITHUB,
            label: 'GitHub',
            icon: <MantineIcon icon={IconBrandGithub} size={18} />,
        },
        {
            type: DbtProjectType.GITLAB,
            label: 'GitLab',
            icon: <MantineIcon icon={IconBrandGitlab} size={18} />,
        },
        {
            type: DbtProjectType.BITBUCKET,
            label: 'Bitbucket',
            icon: <MantineIcon icon={IconBrandBitbucket} size={18} />,
        },
        {
            type: DbtProjectType.AZURE_DEVOPS,
            label: 'Azure DevOps',
            icon: <MantineIcon icon={IconBrandAzure} size={18} />,
        },
        {
            type: DbtProjectType.DBT_CLOUD_IDE,
            label: 'dbt Cloud',
            icon: <Image src={DbtLogo} alt="" w={18} h={18} />,
        },
    ];

interface DbtSettingsFormProps {
    disabled: boolean;
    defaultType?: DbtProjectType;
    /** Tiles suit a first-time setup, the select suits project settings */
    typePicker?: 'select' | 'tiles';
}

const DbtSettingsForm: FC<DbtSettingsFormProps> = ({
    disabled,
    defaultType,
    typePicker = 'select',
}) => {
    const form = useFormContext();
    const { isDbtSource, projectUuid } = useProjectFormContext();
    const selectedWarehouse = form.values.warehouse?.type;

    const type: DbtProjectType =
        form.values.dbt.type ?? (defaultType || DbtProjectType.GITHUB);

    const isNative =
        (form.values.dbt.type === DbtProjectType.GITHUB ||
            form.values.dbt.type === DbtProjectType.BITBUCKET) &&
        form.values.dbt.semanticLayer === 'lightdash';

    const warehouseType: WarehouseTypes =
        form.values.warehouse?.type ??
        selectedWarehouse ??
        WarehouseTypes.BIGQUERY;

    const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] =
        useState<boolean>(false);
    const toggleAdvancedSettingsOpen = () =>
        setIsAdvancedSettingsOpen((open) => !open);
    const { health } = useApp();
    const options = useMemo(() => {
        // Additional dbt sources are restricted to GitHub for now (the merge is
        // git-only, and the other providers aren't validated end-to-end yet).
        if (isDbtSource) {
            return [
                {
                    value: DbtProjectType.GITHUB,
                    label: DbtProjectTypeLabels[DbtProjectType.GITHUB],
                },
            ];
        }

        const enabledTypes = [
            DbtProjectType.GITHUB,
            DbtProjectType.GITLAB,
            DbtProjectType.BITBUCKET,
            DbtProjectType.AZURE_DEVOPS,
            DbtProjectType.NONE,
            DbtProjectType.MANIFEST,
            DbtProjectType.DBT_CLOUD_IDE,
        ];
        if (health.data?.localDbtEnabled) {
            enabledTypes.push(DbtProjectType.DBT);
        }

        return enabledTypes.map((value) => ({
            value,
            label: DbtProjectTypeLabels[value],
        }));
    }, [health, isDbtSource]);

    const DbtForm = useMemo(() => {
        switch (type) {
            case DbtProjectType.DBT:
                return DbtLocalForm;
            case DbtProjectType.DBT_CLOUD_IDE:
                return DbtCloudForm;
            case DbtProjectType.GITHUB:
                return GithubForm;
            case DbtProjectType.GITLAB:
                return GitlabForm;
            case DbtProjectType.BITBUCKET:
                return BitBucketForm;
            case DbtProjectType.AZURE_DEVOPS:
                return AzureDevOpsForm;
            case DbtProjectType.NONE:
                return DbtNoneForm;
            case DbtProjectType.MANIFEST:
                return DbtManifestForm;
            default: {
                return assertUnreachable(
                    type,
                    `Unknown dbt project type ${type}`,
                );
            }
        }
    }, [type]);

    const awaitingSignIn = useAwaitingGithubSignIn();

    const changeType = (dbtType: DbtProjectType) => {
        form.getInputProps('dbt.type').onChange(dbtType);
        form.setValues({ dbt: dbtDefaults.formValues[dbtType] });
    };

    const baseDocUrl =
        'https://docs.lightdash.com/get-started/setup-lightdash/connect-project#';
    const typeDocUrls = {
        [DbtProjectType.GITHUB]: {
            env: `environment-variables`,
        },
        [DbtProjectType.GITLAB]: {
            env: `environment-variables-1`,
        },
        [DbtProjectType.AZURE_DEVOPS]: {
            env: `environment-variables-2`,
        },
        [DbtProjectType.DBT]: {
            env: `environment-variables-3`,
        },
        [DbtProjectType.BITBUCKET]: {
            env: `environment-variables-3`,
        },
        [DbtProjectType.DBT_CLOUD_IDE]: {
            env: `environment-variables`,
        },
        [DbtProjectType.NONE]: {
            env: `environment-variables-3`,
        },
        [DbtProjectType.MANIFEST]: {
            env: `environment-variables-3`,
        },
    };

    return (
        <div className={classes.root}>
            <Stack mt="xs">
                {typePicker === 'tiles' ? (
                    <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
                        {SOURCE_TILES.map((tile) => (
                            <UnstyledButton
                                key={tile.type}
                                className={classes.sourceTile}
                                data-active={type === tile.type}
                                disabled={disabled}
                                onClick={() => changeType(tile.type)}
                            >
                                <Box className={classes.sourceIcon}>
                                    {tile.icon}
                                </Box>
                                <Text fz="sm" fw={500}>
                                    {tile.label}
                                </Text>
                            </UnstyledButton>
                        ))}
                    </SimpleGrid>
                ) : (
                    <Select
                        allowDeselect={false}
                        name="dbt.type"
                        {...form.getInputProps('dbt.type')}
                        onChange={(value) => {
                            if (!value) return;
                            changeType(value as DbtProjectType);
                        }}
                        defaultValue={DbtProjectType.GITHUB}
                        label="Type"
                        data={options}
                        required
                        disabled={disabled}
                    />
                )}

                <DbtForm disabled={disabled} />

                {/* Skipping still needs a schema, so surface it when the target section does not */}
                {(awaitingSignIn ||
                    isNative ||
                    isDbtSource ||
                    type === DbtProjectType.NONE) &&
                    form.errors['warehouse.schema'] && (
                        <WarehouseSchemaInput
                            warehouseType={warehouseType}
                            disabled={disabled}
                        />
                    )}

                {type !== DbtProjectType.NONE &&
                    !isNative &&
                    !awaitingSignIn && (
                        <>
                            <FormSection name="target">
                                <Stack mt="xs">
                                    <TextInput
                                        name="dbt.target"
                                        {...form.getInputProps('dbt.target')}
                                        label="Target name"
                                        description={
                                            <p>
                                                The name Lightdash gives the dbt
                                                target it compiles with. Set it
                                                to match the target your dbt
                                                code branches on. It does not
                                                change which database or schema
                                                your models are read from.
                                            </p>
                                        }
                                        disabled={disabled}
                                        placeholder="prod"
                                    />
                                    {/* A source shares the project's warehouse but
                                not necessarily the same location inside it, so
                                it sets its own here. Hidden on the project form
                                when org warehouse credentials provide it. */}
                                    {isDbtSource && projectUuid ? (
                                        <WarehouseLocationInputs
                                            projectUuid={projectUuid}
                                        />
                                    ) : null}
                                    {isDbtSource ? null : (
                                        <WarehouseSchemaInput
                                            warehouseType={warehouseType}
                                            disabled={disabled}
                                        />
                                    )}
                                </Stack>
                            </FormSection>
                            <FormSection
                                name="Advanced"
                                isOpen={isAdvancedSettingsOpen}
                            >
                                <Stack mt="xs">
                                    {type !== DbtProjectType.DBT_CLOUD_IDE && (
                                        <TextInput
                                            name="dbt.selector"
                                            {...form.getInputProps(
                                                'dbt.selector',
                                            )}
                                            label="dbt selector"
                                            description={
                                                <p>
                                                    Add dbt selectors to filter
                                                    out models from your dbt
                                                    project. You can see more
                                                    details in{' '}
                                                    <Anchor
                                                        inherit
                                                        href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project/#dbt-selector"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        our docs
                                                    </Anchor>
                                                    .
                                                </p>
                                            }
                                            disabled={disabled}
                                            placeholder="tag:lightdash"
                                        />
                                    )}

                                    <MultiKeyValuePairsInput
                                        name="dbt.environment"
                                        label="Environment variables"
                                        documentationUrl={`${baseDocUrl}${typeDocUrls[type].env}`}
                                        disabled={disabled}
                                    />
                                </Stack>
                            </FormSection>
                            <FormCollapseButton
                                isSectionOpen={isAdvancedSettingsOpen}
                                onClick={toggleAdvancedSettingsOpen}
                            >
                                Advanced configuration options
                            </FormCollapseButton>
                        </>
                    )}
            </Stack>
        </div>
    );
};

export default DbtSettingsForm;
