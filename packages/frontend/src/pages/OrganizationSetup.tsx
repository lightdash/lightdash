import {
    CompleteUserSchema,
    FeatureFlags,
    getEmailDomain,
    LightdashMode,
    validateOrganizationEmailDomains,
    type HealthState,
    type OrganizationBrandColor,
    type OrganizationBrandLogo,
} from '@lightdash/common';
import {
    Box,
    Button,
    Checkbox,
    Divider,
    Group,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useEffect, useRef, useState, type FC } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { DocumentTitle } from '../components/common/DocumentTitle';
import LightdashLogo from '../components/LightdashLogo/LightdashLogo';
import PageSpinner from '../components/PageSpinner';
import { jobTitles } from '../components/UserCompletionModal/jobTitles';
import {
    useDetectOrganizationBrand,
    useSaveOrganizationBrand,
} from '../hooks/organization/useOrganizationBrand';
import { type UserWithAbility } from '../hooks/user/useUser';
import { useUserCompleteMutation } from '../hooks/user/useUserCompleteMutation';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useApp from '../providers/App/useApp';
import classes from './OrganizationSetup.module.css';
import { OrganizationSetupPreview } from './OrganizationSetupPreview';

const PRESET_COLORS = ['#4c6ef5', '#7950f2', '#40c057', '#f59f00', '#fa5252'];
const DEFAULT_COLOR = PRESET_COLORS[0];
const MAX_SWATCHES = 7;

const isValidHexColor = (hex: string): boolean =>
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex);

const dedupeColors = (colors: string[]): string[] => {
    const seen = new Set<string>();
    return colors.filter((color) => {
        const key = color.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const brandColorsSorted = (colors: OrganizationBrandColor[]): string[] => {
    const priority = (type: string) =>
        type === 'accent' ? 0 : type === 'brand' ? 1 : 2;
    return dedupeColors(
        colors
            .filter((color) => isValidHexColor(color.hex))
            .slice()
            .sort((a, b) => priority(a.type) - priority(b.type))
            .map((color) => color.hex),
    );
};

const buildSwatches = (brandColors: string[]): string[] =>
    dedupeColors([...brandColors, ...PRESET_COLORS]).slice(0, MAX_SWATCHES);

const pickTileLogo = (logos: OrganizationBrandLogo[]): string | null => {
    const dark = logos.find((logo) => logo.theme === 'dark');
    const neutral = logos.find((logo) => logo.theme === null);
    return dark?.url ?? neutral?.url ?? logos[0]?.url ?? null;
};

const inferOrganizationName = (domain: string): string =>
    (domain.split('.')[0] ?? '')
        .split(/[-_]/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

const buildBrandColors = (
    selectedColor: string,
    brandColors: OrganizationBrandColor[],
): OrganizationBrandColor[] => {
    const matchesSelected = (hex: string) =>
        hex.toLowerCase() === selectedColor.toLowerCase();
    const existing = brandColors.find((color) => matchesSelected(color.hex));
    const selectedEntry: OrganizationBrandColor = existing
        ? { ...existing, type: 'accent' }
        : { hex: selectedColor, type: 'accent', brightness: null };
    return [
        selectedEntry,
        ...brandColors.filter((color) => !matchesSelected(color.hex)),
    ];
};

type OrganizationSetupFormValues = {
    organizationName: string;
    jobTitle: string;
    enableEmailDomainAccess: boolean;
    isMarketingOptedIn: boolean;
    isTrackingAnonymized: boolean;
    selectedColor: string;
};

type OrganizationSetupContentProps = {
    user: UserWithAbility;
    health: HealthState;
};

const OrganizationSetupContent: FC<OrganizationSetupContentProps> = ({
    user,
    health,
}) => {
    const navigate = useNavigate();

    const canEnterOrganizationName = user.organizationName === '';
    const emailDomain = user.email ? getEmailDomain(user.email) : '';
    const isCompanyDomain =
        !!user.email && !validateOrganizationEmailDomains([emailDomain]);
    const canEnableEmailDomainAccess =
        canEnterOrganizationName && isCompanyDomain;

    const form = useForm<OrganizationSetupFormValues>({
        initialValues: {
            organizationName:
                canEnterOrganizationName && isCompanyDomain
                    ? inferOrganizationName(emailDomain)
                    : '',
            jobTitle: '',
            enableEmailDomainAccess: canEnableEmailDomainAccess,
            isMarketingOptedIn: true,
            isTrackingAnonymized: false,
            selectedColor: DEFAULT_COLOR,
        },
        validate: zodResolver(
            canEnterOrganizationName
                ? CompleteUserSchema
                : CompleteUserSchema.omit({ organizationName: true }),
        ),
    });

    const brandDetection = useDetectOrganizationBrand(
        emailDomain,
        health.hasBrandfetch && canEnterOrganizationName && isCompanyDomain,
    );
    const saveBrand = useSaveOrganizationBrand();
    const completeMutation = useUserCompleteMutation();

    const { setValues, isDirty } = form;
    const hasAppliedDetectedBrand = useRef(false);

    useEffect(() => {
        const brand = brandDetection.data;
        if (!brand || hasAppliedDetectedBrand.current) return;
        hasAppliedDetectedBrand.current = true;
        const detected = brandColorsSorted(brand.colors);
        setValues((current) => ({
            ...(brand.name && !isDirty('organizationName')
                ? { organizationName: brand.name }
                : {}),
            ...(current.selectedColor === DEFAULT_COLOR && detected[0]
                ? { selectedColor: detected[0] }
                : {}),
        }));
    }, [brandDetection.data, isDirty, setValues]);

    useEffect(() => {
        if (completeMutation.isSuccess) {
            void navigate('/');
        }
    }, [completeMutation.isSuccess, navigate]);

    const detectedBrand = brandDetection.data ?? null;
    const detectedColors = detectedBrand
        ? brandColorsSorted(detectedBrand.colors)
        : [];
    const swatches = buildSwatches(detectedColors);
    const detectedLogoUrl = detectedBrand
        ? pickTileLogo(detectedBrand.logos)
        : null;
    const selectedColor = form.values.selectedColor;

    const previewColors = buildBrandColors(
        selectedColor,
        detectedBrand?.colors ?? [],
    );
    const previewDomain =
        detectedBrand?.domain ?? (isCompanyDomain ? emailDomain : '');
    const titleFont =
        detectedBrand?.fonts.find((font) => font.type === 'title') ?? null;
    const bodyFont =
        detectedBrand?.fonts.find((font) => font.type === 'body') ?? null;

    const showWorkspaceStep = canEnterOrganizationName;
    const totalSteps = showWorkspaceStep ? 2 : 1;
    const [step, setStep] = useState(1);

    const isWorkspaceStep = showWorkspaceStep && step === 1;
    const stepLabel = isWorkspaceStep ? 'Set up your workspace' : 'About you';
    const displayStep = showWorkspaceStep ? step : 1;

    const handleSubmit = form.onSubmit((values) => {
        if (isWorkspaceStep) {
            if (values.organizationName.trim()) {
                setStep(2);
            }
            return;
        }

        if (user.organizationName) {
            completeMutation.mutate({
                jobTitle: values.jobTitle,
                enableEmailDomainAccess: values.enableEmailDomainAccess,
                isMarketingOptedIn: values.isMarketingOptedIn,
                isTrackingAnonymized: values.isTrackingAnonymized,
            });
        } else {
            completeMutation.mutate({
                organizationName: values.organizationName,
                jobTitle: values.jobTitle,
                enableEmailDomainAccess: values.enableEmailDomainAccess,
                isMarketingOptedIn: values.isMarketingOptedIn,
                isTrackingAnonymized: values.isTrackingAnonymized,
            });
        }

        if (detectedBrand) {
            saveBrand.mutate({
                domain: detectedBrand.domain,
                name: detectedBrand.name,
                description: detectedBrand.description,
                logos: detectedBrand.logos,
                colors: buildBrandColors(selectedColor, detectedBrand.colors),
                fonts: detectedBrand.fonts,
            });
        }
    });

    const logoTileInitial = (form.values.organizationName || '?')
        .charAt(0)
        .toUpperCase();

    return (
        <Box className={classes.page}>
            <DocumentTitle title="Set up your organization" />
            <Box className={classes.topBar}>
                <LightdashLogo />
                <Text size="sm" c="dimmed">
                    Step {displayStep} of {totalSteps} · {stepLabel}
                </Text>
            </Box>

            <Box className={classes.body}>
                <Box className={classes.leftPane}>
                    <form onSubmit={handleSubmit} noValidate>
                        {isWorkspaceStep ? (
                            <Stack gap="lg">
                                <Stack gap="xs">
                                    <Title
                                        order={1}
                                        fz={44}
                                        className={classes.heading}
                                    >
                                        Name your organization
                                    </Title>
                                    <Text c="dimmed" size="lg">
                                        This is how your team and your agent
                                        will refer to your workspace.
                                    </Text>
                                </Stack>

                                <TextInput
                                    label="Organization name"
                                    placeholder="Acme Analytics"
                                    size="md"
                                    required
                                    {...form.getInputProps('organizationName')}
                                />

                                <Divider />

                                <Stack gap="md">
                                    <Group gap="sm">
                                        <Text fw={600}>Brand</Text>
                                        <Text
                                            size="xs"
                                            c="dimmed"
                                            className={classes.optionalPill}
                                        >
                                            Optional · you can change this later
                                        </Text>
                                    </Group>

                                    <Group gap="lg" align="flex-start">
                                        <Box
                                            className={classes.logoTile}
                                            bg={
                                                detectedLogoUrl
                                                    ? 'var(--mantine-color-ldGray-0)'
                                                    : selectedColor
                                            }
                                        >
                                            {detectedLogoUrl ? (
                                                <img
                                                    src={detectedLogoUrl}
                                                    alt=""
                                                    className={
                                                        classes.logoTileImage
                                                    }
                                                />
                                            ) : (
                                                <Text
                                                    fw={700}
                                                    fz={20}
                                                    c="white"
                                                >
                                                    {logoTileInitial}
                                                </Text>
                                            )}
                                        </Box>

                                        <Stack gap="xs">
                                            <Text size="sm" fw={500}>
                                                Theme color
                                            </Text>
                                            <Box className={classes.swatchRow}>
                                                {swatches.map((color) => (
                                                    <Box
                                                        key={color}
                                                        component="button"
                                                        type="button"
                                                        aria-label={`Select theme color ${color}`}
                                                        className={
                                                            color.toLowerCase() ===
                                                            selectedColor.toLowerCase()
                                                                ? `${classes.swatch} ${classes.swatchSelected}`
                                                                : classes.swatch
                                                        }
                                                        bg={color}
                                                        onClick={() =>
                                                            form.setFieldValue(
                                                                'selectedColor',
                                                                color,
                                                            )
                                                        }
                                                    />
                                                ))}
                                            </Box>
                                        </Stack>
                                    </Group>
                                </Stack>

                                <Group>
                                    <Button
                                        type="submit"
                                        color="dark"
                                        size="md"
                                        disabled={
                                            !form.values.organizationName.trim()
                                        }
                                    >
                                        Continue
                                    </Button>
                                </Group>
                            </Stack>
                        ) : (
                            <Stack gap="lg">
                                <Stack gap="xs">
                                    <Title
                                        order={1}
                                        fz={44}
                                        className={classes.heading}
                                    >
                                        Tell us about you
                                    </Title>
                                    <Text c="dimmed" size="lg">
                                        This helps us tailor Lightdash for you.
                                    </Text>
                                </Stack>

                                <Select
                                    label="What's your role?"
                                    data={jobTitles}
                                    placeholder="Select your role"
                                    size="md"
                                    required
                                    {...form.getInputProps('jobTitle')}
                                />

                                <Stack gap="xs">
                                    {canEnableEmailDomainAccess && (
                                        <Checkbox
                                            label={`Allow users with @${emailDomain} to join the organization as a viewer`}
                                            {...form.getInputProps(
                                                'enableEmailDomainAccess',
                                                { type: 'checkbox' },
                                            )}
                                        />
                                    )}

                                    <Checkbox
                                        label="Keep me updated on new Lightdash features"
                                        {...form.getInputProps(
                                            'isMarketingOptedIn',
                                            { type: 'checkbox' },
                                        )}
                                    />

                                    {health.mode !==
                                        LightdashMode.CLOUD_BETA && (
                                        <Checkbox
                                            label="Anonymize my usage data"
                                            {...form.getInputProps(
                                                'isTrackingAnonymized',
                                                { type: 'checkbox' },
                                            )}
                                        />
                                    )}
                                </Stack>

                                <Group>
                                    {showWorkspaceStep && (
                                        <Button
                                            variant="subtle"
                                            color="gray"
                                            size="md"
                                            onClick={() => setStep(1)}
                                        >
                                            Back
                                        </Button>
                                    )}
                                    <Button
                                        type="submit"
                                        color="dark"
                                        size="md"
                                        loading={completeMutation.isLoading}
                                        disabled={!form.values.jobTitle}
                                    >
                                        Finish
                                    </Button>
                                </Group>
                            </Stack>
                        )}
                    </form>
                </Box>

                <Box className={classes.rightPane}>
                    <OrganizationSetupPreview
                        domain={previewDomain}
                        name={form.values.organizationName || null}
                        logos={detectedBrand?.logos ?? []}
                        colors={previewColors}
                        titleFont={titleFont}
                        bodyFont={bodyFont}
                        detectedDomain={detectedBrand?.domain ?? null}
                        detectedLogoUrl={detectedLogoUrl}
                    />
                </Box>
            </Box>
        </Box>
    );
};

const OrganizationSetup: FC = () => {
    const { health, user } = useApp();
    const orgSetupPageFlag = useServerFeatureFlag(
        FeatureFlags.OrganizationSetupPage,
    );

    if (health.isInitialLoading || health.error) {
        return <PageSpinner />;
    }

    if (!health.data?.isAuthenticated) {
        return <Navigate to="/login" />;
    }

    if (user.isInitialLoading || orgSetupPageFlag.isLoading) {
        return <PageSpinner />;
    }

    if (!user.data) {
        return <PageSpinner />;
    }

    if (!user.data.organizationUuid) {
        return <Navigate to="/join-organization" />;
    }

    if (user.data.isSetupComplete) {
        return <Navigate to="/" />;
    }

    if (!orgSetupPageFlag.data?.enabled) {
        return <Navigate to="/" />;
    }

    return (
        <OrganizationSetupContent
            key={user.data.userUuid}
            user={user.data}
            health={health.data}
        />
    );
};

export default OrganizationSetup;
