import {
    MissingConfigError,
    type AiOrganizationSettings,
    type AiOrgModelVisibility,
} from '@lightdash/common';
import { vi } from 'vitest';
import { aiCopilotConfigSchema } from '../../../config/aiConfigSchema';
import { LightdashConfig } from '../../../config/parseConfig';
import { AiModelCatalog } from '../../clients/Ai/AiModelCatalog';
import {
    AiOrganizationProviderCredentialModel,
    DecryptedAiProviderCredential,
    type AiProviderCredentialResolution,
} from '../../models/AiOrganizationProviderCredentialModel';
import {
    AiOrganizationSettingsModel,
    AiOrgProviderApiKeys,
} from '../../models/AiOrganizationSettingsModel';
import { filterModelsForOrg, getAvailableModels } from './models';
import {
    OrgAiCopilotConfigResolver,
    overlayOrgProviderApiKeys,
    resolveEffectiveModelVisibility,
    type CopilotConfig,
} from './OrgAiCopilotConfigResolver';

const baseConfig: CopilotConfig = aiCopilotConfigSchema.parse({
    enabled: true,
    requiresFeatureFlag: false,
    telemetryEnabled: false,
    threadDumpEnabled: false,
    debugLoggingEnabled: false,
    askAiButtonEnabled: false,
    embeddingEnabled: false,
    maxQueryLimit: 100,
    runSqlMaxLimit: 100,
    defaultProvider: 'openai',
    defaultEmbeddingModelProvider: 'openai',
    providers: {
        openai: {
            apiKey: 'instance-openai-key',
            modelName: 'gpt-5.4',
            embeddingModelName: 'text-embedding-3-small',
            zeroDataRetention: false,
        },
    },
});

const bothProvidersConfig: CopilotConfig = aiCopilotConfigSchema.parse({
    enabled: true,
    requiresFeatureFlag: false,
    telemetryEnabled: false,
    threadDumpEnabled: false,
    debugLoggingEnabled: false,
    askAiButtonEnabled: false,
    embeddingEnabled: false,
    maxQueryLimit: 100,
    runSqlMaxLimit: 100,
    defaultProvider: 'openai',
    defaultEmbeddingModelProvider: 'openai',
    providers: {
        openai: {
            apiKey: 'instance-openai-key',
            modelName: 'gpt-5.4',
            embeddingModelName: 'text-embedding-3-small',
            zeroDataRetention: false,
        },
        anthropic: { apiKey: 'instance-anthropic-key' },
    },
});

const allByoProvidersConfig: CopilotConfig = aiCopilotConfigSchema.parse({
    ...bothProvidersConfig,
    providers: {
        ...bothProvidersConfig.providers,
        google: {
            apiKey: 'instance-google-key',
            modelName: 'gemini-3.8-flash',
        },
    },
});

const anthropicGatewayConfig: CopilotConfig = aiCopilotConfigSchema.parse({
    ...bothProvidersConfig,
    providers: {
        ...bothProvidersConfig.providers,
        anthropic: {
            ...bothProvidersConfig.providers.anthropic,
            baseUrl: 'https://llm-gateway.example',
        },
    },
});

const googleGatewayConfig: CopilotConfig = aiCopilotConfigSchema.parse({
    ...allByoProvidersConfig,
    providers: {
        ...allByoProvidersConfig.providers,
        google: {
            ...allByoProvidersConfig.providers.google,
            baseUrl: 'https://gemini-gateway.example/v1beta',
        },
    },
});

const bedrockConfig: CopilotConfig = aiCopilotConfigSchema.parse({
    enabled: true,
    requiresFeatureFlag: false,
    telemetryEnabled: false,
    threadDumpEnabled: false,
    debugLoggingEnabled: false,
    askAiButtonEnabled: false,
    embeddingEnabled: false,
    maxQueryLimit: 100,
    runSqlMaxLimit: 100,
    defaultProvider: 'bedrock',
    defaultEmbeddingModelProvider: 'openai',
    providers: {
        bedrock: {
            apiKey: 'instance-bedrock-key',
            region: 'us-east-2',
        },
    },
});

describe('overlayOrgProviderApiKeys', () => {
    it('switches the default provider to the org key when the instance default is not BYO-supplied', () => {
        const result = overlayOrgProviderApiKeys(bothProvidersConfig, {
            anthropic: 'org-anthropic-key',
        });
        // Anthropic-only BYO key + instance default "openai" would otherwise
        // resolve auxiliary AI to the instance OpenAI key — switch to anthropic.
        expect(result.defaultProvider).toBe('anthropic');
        expect(result.providers.anthropic?.apiKey).toBe('org-anthropic-key');
    });

    it('keeps the default provider when the org supplied a key for it', () => {
        const result = overlayOrgProviderApiKeys(bothProvidersConfig, {
            openai: 'org-openai-key',
        });
        expect(result.defaultProvider).toBe('openai');
    });

    it('keeps the default provider when the org keyed both providers', () => {
        const result = overlayOrgProviderApiKeys(bothProvidersConfig, {
            anthropic: 'org-anthropic-key',
            openai: 'org-openai-key',
        });
        expect(result.defaultProvider).toBe('openai');
    });

    it('records byoProviders for each overlaid org key', () => {
        expect(
            overlayOrgProviderApiKeys(bothProvidersConfig, {
                anthropic: 'org-anthropic-key',
            }).byoProviders,
        ).toEqual(['anthropic']);
        expect(
            overlayOrgProviderApiKeys(bothProvidersConfig, {
                anthropic: 'org-anthropic-key',
                openai: 'org-openai-key',
            }).byoProviders.sort(),
        ).toEqual(['anthropic', 'openai']);
    });

    it('omits from byoProviders any key the instance has not configured', () => {
        // baseConfig has no anthropic provider, so an anthropic org key is not
        // overlaid and must not count as self-managed.
        expect(
            overlayOrgProviderApiKeys(baseConfig, {
                anthropic: 'org-anthropic-key',
            }).byoProviders,
        ).toEqual([]);
    });

    it('replaces the apiKey of an instance-configured provider, keeping other settings', () => {
        const result = overlayOrgProviderApiKeys(baseConfig, {
            openai: 'org-openai-key',
        });
        expect(result.providers.openai?.apiKey).toBe('org-openai-key');
        expect(result.providers.openai?.modelName).toBe('gpt-5.4');
        expect(result.defaultProvider).toBe('openai');
    });

    it('routes the org key through the org gateway URL', () => {
        const result = overlayOrgProviderApiKeys(baseConfig, {
            openai: 'org-openai-key',
            providerBaseUrls: { openai: 'https://litellm.example.com' },
        });
        expect(result.providers.openai?.apiKey).toBe('org-openai-key');
        expect(result.providers.openai?.baseUrl).toBe(
            'https://litellm.example.com',
        );
    });

    it('overlays a Google key without changing the configured Gemini model', () => {
        const result = overlayOrgProviderApiKeys(allByoProvidersConfig, {
            google: 'org-google-key',
        });

        expect(result.providers.google?.apiKey).toBe('org-google-key');
        expect(result.providers.google?.modelName).toBe('gemini-3.8-flash');
        expect(result.defaultProvider).toBe('google');
        expect(result.byoProviders).toEqual(['google']);
    });

    it('rejects an organization Anthropic key when the instance uses an Anthropic gateway', () => {
        expect(() =>
            overlayOrgProviderApiKeys(anthropicGatewayConfig, {
                anthropic: 'org-anthropic-key',
            }),
        ).toThrow('Organization Anthropic API keys cannot be used');
    });

    it('replaces the instance Anthropic gateway with an org gateway instead of rejecting the key', () => {
        const result = overlayOrgProviderApiKeys(anthropicGatewayConfig, {
            anthropic: 'org-anthropic-key',
            providerBaseUrls: { anthropic: 'https://litellm.example.com' },
        });
        expect(result.providers.anthropic?.apiKey).toBe('org-anthropic-key');
        expect(result.providers.anthropic?.baseUrl).toBe(
            'https://litellm.example.com',
        );
    });

    it('does not send the instance gateway headers to the org gateway', () => {
        const withHeaders: CopilotConfig = aiCopilotConfigSchema.parse({
            ...anthropicGatewayConfig,
            providers: {
                ...anthropicGatewayConfig.providers,
                anthropic: {
                    ...anthropicGatewayConfig.providers.anthropic,
                    customHeaders: { 'x-gateway-token': 'instance-secret' },
                },
            },
        });
        const result = overlayOrgProviderApiKeys(withHeaders, {
            anthropic: 'org-anthropic-key',
            providerBaseUrls: { anthropic: 'https://litellm.example.com' },
        });
        expect(result.providers.anthropic?.customHeaders).toEqual({});
        // Without an org URL the instance headers still apply to the org key.
        expect(
            overlayOrgProviderApiKeys(baseConfig, {
                openai: 'org-openai-key',
            }).providers.openai?.customHeaders,
        ).toEqual(baseConfig.providers.openai?.customHeaders);
    });

    it('rejects an organization Google key when the instance uses a Gemini gateway without exposing the key', () => {
        const orgKey = 'full-fake-org-google-secret';

        try {
            overlayOrgProviderApiKeys(googleGatewayConfig, {
                google: orgKey,
            });
            throw new Error('Expected Gemini gateway conflict');
        } catch (error) {
            if (!(error instanceof Error)) throw error;
            expect(error.message).toContain('GEMINI_BASE_URL');
            expect(error.message).not.toContain(orgKey);
        }
    });

    it('ignores a key for a provider the instance has not configured', () => {
        const result = overlayOrgProviderApiKeys(baseConfig, {
            anthropic: 'org-anthropic-key',
        });
        // No instance anthropic provider → nothing to override, key is dropped
        // here (the write path rejects such keys before they are stored).
        expect(result.providers.anthropic).toBeUndefined();
        expect(result.defaultProvider).toBe('openai');
    });

    it('does not mutate the base config', () => {
        overlayOrgProviderApiKeys(baseConfig, { openai: 'org-openai-key' });
        expect(baseConfig.providers.openai?.apiKey).toBe('instance-openai-key');
    });

    it('leaves the config untouched when the org has no keys', () => {
        const result = overlayOrgProviderApiKeys(baseConfig, {});
        expect(result.providers.openai?.apiKey).toBe('instance-openai-key');
        expect(result.defaultProvider).toBe('openai');
    });
});

describe('resolveEffectiveModelVisibility', () => {
    it('hides every unkeyed BYO provider when an Anthropic key exists', () => {
        expect(
            resolveEffectiveModelVisibility({ anthropic: 'sk-ant-x' }, null),
        ).toEqual({
            google: { enabled: false },
            openai: { enabled: false },
            bedrock: { enabled: false },
        });
    });

    it('hides the other BYO providers when bedrock is configured', () => {
        expect(
            resolveEffectiveModelVisibility(
                {
                    bedrock: {
                        apiKey: 'ABSK',
                        region: 'ap-northeast-1',
                        allowedModels: ['claude-sonnet-4-5'],
                    },
                },
                null,
            ),
        ).toEqual({
            anthropic: { enabled: false },
            google: { enabled: false },
            openai: { enabled: false },
        });
    });

    it('still hides Google when Anthropic and OpenAI keys are present', () => {
        expect(
            resolveEffectiveModelVisibility(
                { anthropic: 'sk-ant-x', openai: 'sk-x' },
                null,
            ),
        ).toEqual({
            google: { enabled: false },
            bedrock: { enabled: false },
        });
    });

    it('hides Anthropic and Google with only an OpenAI key', () => {
        expect(
            resolveEffectiveModelVisibility({ openai: 'sk-x' }, null),
        ).toEqual({
            anthropic: { enabled: false },
            google: { enabled: false },
            bedrock: { enabled: false },
        });
    });

    it('hides Anthropic and OpenAI with only a Google key', () => {
        expect(
            resolveEffectiveModelVisibility({ google: 'google-key' }, null),
        ).toEqual({
            anthropic: { enabled: false },
            openai: { enabled: false },
            bedrock: { enabled: false },
        });
    });

    it('lets explicit stored visibility override the implicit hide', () => {
        expect(
            resolveEffectiveModelVisibility(
                { anthropic: 'sk-ant-x' },
                { openai: { enabled: true } },
            ),
        ).toEqual({
            google: { enabled: false },
            openai: { enabled: true },
            bedrock: { enabled: false },
        });
    });

    it('keeps stored visibility for other providers alongside the implicit hide', () => {
        expect(
            resolveEffectiveModelVisibility(
                { anthropic: 'sk-ant-x' },
                {
                    anthropic: {
                        enabled: true,
                        allowedModels: ['claude-opus-4-8'],
                    },
                },
            ),
        ).toEqual({
            google: { enabled: false },
            openai: { enabled: false },
            bedrock: { enabled: false },
            anthropic: { enabled: true, allowedModels: ['claude-opus-4-8'] },
        });
    });
});

/** Builds the resolution a credential lookup returns for a test's setup. */
const resolutionFor = (
    credential: DecryptedAiProviderCredential | null,
    unreadable: { uuid: string; label: string } | null,
): AiProviderCredentialResolution => {
    if (unreadable) return { status: 'unreadable', ...unreadable };
    if (credential) return { status: 'ok', credential };
    return { status: 'none' };
};

describe('OrgAiCopilotConfigResolver', () => {
    type ResolverOptions = {
        orgKeys?: AiOrgProviderApiKeys | null;
        defaultCredential?: DecryptedAiProviderCredential | null;
        projectCredential?: DecryptedAiProviderCredential | null;
        /** Overrides defaultCredential; models a row that cannot be decrypted. */
        unreadableDefault?: { uuid: string; label: string } | null;
        /** Overrides projectCredential; models a pinned row that cannot be decrypted. */
        unreadableProjectCredential?: { uuid: string; label: string } | null;
        modelVisibility?: AiOrgModelVisibility | null;
        accessibleModelIds?: string[] | null;
        instanceConfig?: CopilotConfig;
    };

    const makeResolver = ({
        orgKeys = { openai: 'org-openai-key' },
        defaultCredential = null,
        projectCredential = null,
        unreadableDefault = null,
        unreadableProjectCredential = null,
        modelVisibility = null,
        accessibleModelIds = null,
        instanceConfig = baseConfig,
    }: ResolverOptions = {}) =>
        new OrgAiCopilotConfigResolver({
            lightdashConfig: {
                ai: { copilot: instanceConfig },
            } as LightdashConfig,
            aiOrganizationSettingsModel: {
                findDecryptedProviderApiKeys: vi
                    .fn()
                    .mockResolvedValue(orgKeys),
                findByOrganizationUuid: vi.fn().mockResolvedValue({
                    modelVisibility,
                } as AiOrganizationSettings),
            } as Pick<
                AiOrganizationSettingsModel,
                'findDecryptedProviderApiKeys' | 'findByOrganizationUuid'
            > as AiOrganizationSettingsModel,
            aiOrganizationProviderCredentialModel: {
                findDefaultDecrypted: vi
                    .fn()
                    .mockResolvedValue(
                        resolutionFor(defaultCredential, unreadableDefault),
                    ),
                findForProjectDecrypted: vi
                    .fn()
                    .mockResolvedValue(
                        resolutionFor(
                            projectCredential ?? defaultCredential,
                            unreadableProjectCredential ?? unreadableDefault,
                        ),
                    ),
            } as Pick<
                AiOrganizationProviderCredentialModel,
                'findDefaultDecrypted' | 'findForProjectDecrypted'
            > as AiOrganizationProviderCredentialModel,
            aiModelCatalog: {
                getAccessibleModelIds: vi
                    .fn()
                    .mockResolvedValue(accessibleModelIds),
            } as Pick<
                AiModelCatalog,
                'getAccessibleModelIds'
            > as AiModelCatalog,
        });

    it('overlays org keys onto the instance config', async () => {
        const result = await makeResolver().getCopilotConfig({
            organizationUuid: 'org-uuid',
            projectUuid: null,
        });
        expect(result.providers.openai?.apiKey).toBe('org-openai-key');
    });

    describe('named provider credentials', () => {
        const bedrockApiKey = (config: CopilotConfig): string | undefined => {
            const { bedrock } = config.providers;
            return bedrock && 'apiKey' in bedrock ? bedrock.apiKey : undefined;
        };

        const credential = (
            overrides: Partial<DecryptedAiProviderCredential> = {},
        ): DecryptedAiProviderCredential => ({
            uuid: 'cred-tokyo',
            organizationUuid: 'org-uuid',
            provider: 'bedrock',
            label: 'Japan (Tokyo)',
            isDefault: true,
            config: {
                apiKey: 'cred-bedrock-key',
                region: 'ap-northeast-1',
                allowedModels: ['claude-sonnet-4-5'],
            },
            ...overrides,
        });

        it('serves the default credential when the org has no legacy keys', async () => {
            const result = await makeResolver({
                orgKeys: null,
                defaultCredential: credential(),
            }).getCopilotConfig({
                organizationUuid: 'org-uuid',
                projectUuid: null,
            });

            expect(result.defaultProvider).toBe('bedrock');
            expect(bedrockApiKey(result)).toBe('cred-bedrock-key');
            expect(result.providers.bedrock?.region).toBe('ap-northeast-1');
        });

        // The whole point of migrating to credentials: the old single-blob
        // region must stop being used once a credential is the default.
        it('wins over a legacy Bedrock blob', async () => {
            const result = await makeResolver({
                orgKeys: {
                    bedrock: {
                        apiKey: 'legacy-bedrock-key',
                        region: 'us-east-1',
                        allowedModels: ['claude-sonnet-4-5'],
                    },
                },
                defaultCredential: credential(),
            }).getCopilotConfig({
                organizationUuid: 'org-uuid',
                projectUuid: null,
            });

            expect(result.providers.bedrock?.region).toBe('ap-northeast-1');
            expect(bedrockApiKey(result)).toBe('cred-bedrock-key');
        });

        it('falls back to the legacy blob when no credential is default', async () => {
            const result = await makeResolver({
                orgKeys: {
                    bedrock: {
                        apiKey: 'legacy-bedrock-key',
                        region: 'us-east-1',
                        allowedModels: ['claude-sonnet-4-5'],
                    },
                },
                defaultCredential: null,
            }).getCopilotConfig({
                organizationUuid: 'org-uuid',
                projectUuid: null,
            });

            expect(result.providers.bedrock?.region).toBe('us-east-1');
            expect(bedrockApiKey(result)).toBe('legacy-bedrock-key');
        });

        it('keeps the other BYO providers from the legacy blob', async () => {
            const result = await makeResolver({
                orgKeys: { anthropic: 'org-anthropic-key' },
                defaultCredential: credential(),
                instanceConfig: bothProvidersConfig,
            }).getCopilotConfig({
                organizationUuid: 'org-uuid',
                projectUuid: null,
            });

            // Bedrock replaces the provider set outright, so a pinned agent
            // cannot send prompts outside the credential's region.
            expect(Object.keys(result.providers)).toEqual(['bedrock']);
            expect(result.byoProviders).toEqual(['bedrock']);
        });

        it('pins the jp inference profile for a Tokyo credential', async () => {
            const result = await makeResolver({
                orgKeys: null,
                defaultCredential: credential(),
            }).getCopilotConfig({
                organizationUuid: 'org-uuid',
                projectUuid: null,
            });

            expect(result.providers.bedrock?.inferenceProfilePrefix).toBe('jp');
        });

        // The whole point of the resolution type: an unreadable credential must
        // not degrade to the legacy key or the instance provider, because both
        // can be a different region than the one the org pinned.
        it('fails the request when the default credential cannot be decrypted', async () => {
            await expect(
                makeResolver({
                    orgKeys: null,
                    unreadableDefault: {
                        uuid: 'cred-tokyo',
                        label: 'Japan (Tokyo)',
                    },
                }).getCopilotConfig({
                    organizationUuid: 'org-uuid',
                    projectUuid: null,
                }),
            ).rejects.toThrow(MissingConfigError);
        });

        it('fails the request when a project-pinned credential cannot be decrypted', async () => {
            await expect(
                makeResolver({
                    orgKeys: null,
                    defaultCredential: credential({
                        uuid: 'cred-us',
                        label: 'US',
                        config: {
                            apiKey: 'us-key',
                            region: 'us-east-1',
                            allowedModels: ['claude-sonnet-4-5'],
                        },
                    }),
                    unreadableProjectCredential: {
                        uuid: 'cred-tokyo',
                        label: 'Japan (Tokyo)',
                    },
                }).getCopilotConfig({
                    organizationUuid: 'org-uuid',
                    projectUuid: 'project-jp',
                }),
            ).rejects.toThrow(MissingConfigError);
        });

        it('does not fall back to a legacy Bedrock blob when the credential is unreadable', async () => {
            await expect(
                makeResolver({
                    orgKeys: {
                        bedrock: {
                            apiKey: 'legacy-bedrock-key',
                            region: 'us-east-1',
                            allowedModels: ['claude-sonnet-4-5'],
                        },
                    },
                    unreadableDefault: {
                        uuid: 'cred-tokyo',
                        label: 'Japan (Tokyo)',
                    },
                }).getCopilotConfig({
                    organizationUuid: 'org-uuid',
                    projectUuid: null,
                }),
            ).rejects.toThrow(/cannot be read/);
        });

        // The repair screen must load while the credential is broken, or the
        // fix sits behind the fault. Display tolerates; execution does not.
        it('still resolves a display config when the default is unreadable', async () => {
            const result = await makeResolver({
                orgKeys: null,
                unreadableDefault: {
                    uuid: 'cred-tokyo',
                    label: 'Japan (Tokyo)',
                },
            }).getCopilotConfigForDisplay('org-uuid');

            expect(result.providers.openai?.apiKey).toBe('instance-openai-key');
            expect(result.byoProviders).toEqual([]);
        });

        it('shows the legacy keys for display rather than the broken credential', async () => {
            const result = await makeResolver({
                orgKeys: { openai: 'org-openai-key' },
                unreadableDefault: {
                    uuid: 'cred-tokyo',
                    label: 'Japan (Tokyo)',
                },
            }).getCopilotConfigForDisplay('org-uuid');

            expect(result.providers.openai?.apiKey).toBe('org-openai-key');
        });

        // The display path takes no project, so an unreadable project pin must
        // not reach it — the settings screen loads regardless.
        it('still resolves a display config when a project pin is unreadable', async () => {
            const result = await makeResolver({
                orgKeys: null,
                unreadableProjectCredential: {
                    uuid: 'cred-tokyo',
                    label: 'Japan (Tokyo)',
                },
            }).getCopilotConfigForDisplay('org-uuid');

            expect(result.providers.openai?.apiKey).toBe('instance-openai-key');
        });

        it('lists model options for an org whose default is unreadable', async () => {
            const overrides = await makeResolver({
                orgKeys: null,
                unreadableDefault: {
                    uuid: 'cred-tokyo',
                    label: 'Japan (Tokyo)',
                },
            }).getOrgModelOverrides('org-uuid');

            expect(overrides).toEqual({
                modelVisibility: null,
                keyAccessibleModelIds: null,
            });
        });

        it('names the credential so an admin knows which key to replace', async () => {
            await expect(
                makeResolver({
                    orgKeys: null,
                    unreadableDefault: {
                        uuid: 'cred-tokyo',
                        label: 'Japan (Tokyo)',
                    },
                }).getCopilotConfig({
                    organizationUuid: 'org-uuid',
                    projectUuid: null,
                }),
            ).rejects.toThrow(/Japan \(Tokyo\)/);
        });

        it("uses the project's own credential over the org default", async () => {
            const result = await makeResolver({
                orgKeys: null,
                defaultCredential: credential({
                    uuid: 'cred-us',
                    label: 'US',
                    config: {
                        apiKey: 'us-key',
                        region: 'us-east-1',
                        allowedModels: ['claude-sonnet-4-5'],
                    },
                }),
                projectCredential: credential(),
            }).getCopilotConfig({
                organizationUuid: 'org-uuid',
                projectUuid: 'project-jp',
            });

            expect(result.providers.bedrock?.region).toBe('ap-northeast-1');
            expect(bedrockApiKey(result)).toBe('cred-bedrock-key');
        });

        // A path with no project states projectUuid: null and must not pick up
        // a project credential by accident.
        it('uses the org default when the caller has no project', async () => {
            const result = await makeResolver({
                orgKeys: null,
                defaultCredential: credential({
                    uuid: 'cred-us',
                    label: 'US',
                    config: {
                        apiKey: 'us-key',
                        region: 'us-east-1',
                        allowedModels: ['claude-sonnet-4-5'],
                    },
                }),
                projectCredential: credential(),
            }).getCopilotConfig({
                organizationUuid: 'org-uuid',
                projectUuid: null,
            });

            expect(result.providers.bedrock?.region).toBe('us-east-1');
            expect(bedrockApiKey(result)).toBe('us-key');
        });

        it('leaves the region-derived profile for a non-Japan credential', async () => {
            const result = await makeResolver({
                orgKeys: null,
                defaultCredential: credential({
                    config: {
                        apiKey: 'cred-bedrock-key',
                        region: 'us-east-1',
                        allowedModels: ['claude-sonnet-4-5'],
                    },
                }),
            }).getCopilotConfig({
                organizationUuid: 'org-uuid',
                projectUuid: null,
            });

            expect(
                result.providers.bedrock?.inferenceProfilePrefix,
            ).toBeUndefined();
        });
    });

    it('uses configured Anthropic models without probing a gateway catalog', async () => {
        const resolver = makeResolver({
            accessibleModelIds: null,
        });

        expect(
            await resolver.getAccessibleModelIds('anthropic', 'gateway-token', {
                baseUrl: 'https://llm-gateway.example',
                availableModels: ['claude-sonnet-4-6'],
            }),
        ).toEqual(['claude-sonnet-4-6']);
    });

    describe('getClaudeCodeConfig', () => {
        it('returns the instance config unchanged without an organization uuid', async () => {
            const result = await makeResolver({
                instanceConfig: bothProvidersConfig,
            }).getClaudeCodeConfig(null);
            expect(result.defaultProvider).toBe('openai');
            expect(result.providers.anthropic?.apiKey).toBe(
                'instance-anthropic-key',
            );
        });

        it('returns the instance config unchanged when the org has no keys', async () => {
            const result = await makeResolver({
                orgKeys: null,
                instanceConfig: bothProvidersConfig,
            }).getClaudeCodeConfig('org-uuid');
            expect(result.providers.anthropic?.apiKey).toBe(
                'instance-anthropic-key',
            );
        });

        it('runs a BYO org on its own Anthropic key and forces the Anthropic provider', async () => {
            const result = await makeResolver({
                orgKeys: { anthropic: 'org-anthropic-key' },
                instanceConfig: bothProvidersConfig,
            }).getClaudeCodeConfig('org-uuid');
            expect(result.defaultProvider).toBe('anthropic');
            expect(result.providers.anthropic?.apiKey).toBe(
                'org-anthropic-key',
            );
        });

        it('never leaks the instance Anthropic key to a BYO org that only keyed OpenAI', async () => {
            const result = await makeResolver({
                orgKeys: { openai: 'org-openai-key' },
                instanceConfig: bothProvidersConfig,
            }).getClaudeCodeConfig('org-uuid');
            // Anthropic is stripped, so key resolution fails loudly rather than
            // silently billing the instance — the sandbox can't run a Claude
            // turn on the instance key.
            expect(result.providers.anthropic).toBeUndefined();
            expect(result.defaultProvider).toBe('anthropic');
        });

        it('fails closed for Claude Code when the org only keyed Google', async () => {
            const result = await makeResolver({
                orgKeys: { google: 'org-google-key' },
                instanceConfig: allByoProvidersConfig,
            }).getClaudeCodeConfig('org-uuid');

            expect(result.providers.anthropic).toBeUndefined();
            expect(result.defaultProvider).toBe('anthropic');
        });
    });

    describe('getCodexConfig', () => {
        it('keeps instance Bedrock as the managed Codex provider', async () => {
            const result = await makeResolver({
                orgKeys: null,
                instanceConfig: bedrockConfig,
            }).getCodexConfig('org-uuid');
            expect(result.defaultProvider).toBe('bedrock');
            expect(result.providers.bedrock?.region).toBe('us-east-2');
        });

        it('returns the instance config unchanged without an organization uuid', async () => {
            const result = await makeResolver({
                instanceConfig: bothProvidersConfig,
            }).getCodexConfig(null);
            expect(result.providers.openai?.apiKey).toBe('instance-openai-key');
        });

        it('runs a BYO org on its own OpenAI key', async () => {
            const result = await makeResolver({
                orgKeys: { openai: 'org-openai-key' },
                instanceConfig: bothProvidersConfig,
            }).getCodexConfig('org-uuid');
            expect(result.defaultProvider).toBe('openai');
            expect(result.providers.openai?.apiKey).toBe('org-openai-key');
        });

        it('never leaks the instance OpenAI key to a BYO org that only keyed Anthropic', async () => {
            const result = await makeResolver({
                orgKeys: { anthropic: 'org-anthropic-key' },
                instanceConfig: bothProvidersConfig,
            }).getCodexConfig('org-uuid');
            expect(result.providers.openai).toBeUndefined();
            expect(result.defaultProvider).toBe('openai');
        });

        it('fails closed for Codex when the org only keyed Google', async () => {
            const result = await makeResolver({
                orgKeys: { google: 'org-google-key' },
                instanceConfig: allByoProvidersConfig,
            }).getCodexConfig('org-uuid');

            expect(result.providers.openai).toBeUndefined();
            expect(result.defaultProvider).toBe('openai');
        });
    });

    describe('resolveEffectiveModelVisibilityForOrg', () => {
        it('merges the implicit auto-hide under the submitted visibility', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant' },
            });
            const effective =
                await resolver.resolveEffectiveModelVisibilityForOrg(
                    'org-uuid',
                    { anthropic: { enabled: false } },
                );
            expect(effective).toEqual({
                google: { enabled: false },
                openai: { enabled: false },
                bedrock: { enabled: false },
                anthropic: { enabled: false },
            });
        });

        it('blocks the lockout: an anthropic-only org disabling anthropic leaves no models', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant' },
            });
            const effective =
                await resolver.resolveEffectiveModelVisibilityForOrg(
                    'org-uuid',
                    { anthropic: { enabled: false } },
                );
            const remaining = filterModelsForOrg(
                getAvailableModels(baseConfig),
                {
                    modelVisibility: effective,
                    keyAccessibleModelIds: null,
                },
            );
            expect(remaining).toHaveLength(0);
        });

        it('validating the raw submission (the old bug) would have left instance models', () => {
            const remaining = filterModelsForOrg(
                getAvailableModels(baseConfig),
                {
                    modelVisibility: { anthropic: { enabled: false } },
                    keyAccessibleModelIds: null,
                },
            );
            expect(remaining.length).toBeGreaterThan(0);
        });

        it('returns the submission unchanged when the org has no keys', async () => {
            const resolver = makeResolver({
                orgKeys: null,
            });
            const submitted = { openai: { enabled: false } };
            expect(
                await resolver.resolveEffectiveModelVisibilityForOrg(
                    'org-uuid',
                    submitted,
                ),
            ).toEqual(submitted);
        });
    });

    describe('getOrgModelOverrides', () => {
        const none = { modelVisibility: null, keyAccessibleModelIds: null };

        it('returns no overrides without an organization uuid', async () => {
            const resolver = makeResolver();
            expect(await resolver.getOrgModelOverrides(null)).toEqual(none);
        });

        it('returns no overrides without BYO keys (settings become inert)', async () => {
            const resolver = makeResolver({
                orgKeys: null,
                modelVisibility: { openai: { enabled: false } },
            });
            expect(await resolver.getOrgModelOverrides('org-uuid')).toEqual(
                none,
            );
        });

        it('returns stored visibility and key-accessible ids with an anthropic key', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant-x' },
                modelVisibility: { openai: { enabled: false } },
                accessibleModelIds: ['claude-opus-4-8'],
            });
            expect(await resolver.getOrgModelOverrides('org-uuid')).toEqual({
                modelVisibility: {
                    google: { enabled: false },
                    openai: { enabled: false },
                    bedrock: { enabled: false },
                },
                keyAccessibleModelIds: { anthropic: ['claude-opus-4-8'] },
            });
        });

        it('auto-hides openai when only an anthropic key is set', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant-x' },
                modelVisibility: null,
                accessibleModelIds: ['claude-opus-4-8'],
            });
            expect(await resolver.getOrgModelOverrides('org-uuid')).toEqual({
                modelVisibility: {
                    google: { enabled: false },
                    openai: { enabled: false },
                    bedrock: { enabled: false },
                },
                keyAccessibleModelIds: { anthropic: ['claude-opus-4-8'] },
            });
        });

        it('does not query the catalog with only an openai key', async () => {
            const resolver = makeResolver({
                orgKeys: { openai: 'sk-x' },
                modelVisibility: { anthropic: { enabled: true } },
                accessibleModelIds: ['claude-opus-4-8'],
            });
            expect(await resolver.getOrgModelOverrides('org-uuid')).toEqual({
                modelVisibility: {
                    anthropic: { enabled: true },
                    google: { enabled: false },
                    bedrock: { enabled: false },
                },
                keyAccessibleModelIds: null,
            });
        });

        it('fails closed when the catalog returns null', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant-x' },
                modelVisibility: { openai: { enabled: false } },
                accessibleModelIds: null,
            });
            expect(await resolver.getOrgModelOverrides('org-uuid')).toEqual({
                modelVisibility: {
                    google: { enabled: false },
                    openai: { enabled: false },
                    bedrock: { enabled: false },
                },
                keyAccessibleModelIds: { anthropic: null },
            });
        });

        it('does not probe a BYO Anthropic key through an instance gateway', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant-x' },
                accessibleModelIds: ['claude-opus-4-8'],
                instanceConfig: anthropicGatewayConfig,
            });

            expect(await resolver.getOrgModelOverrides('org-uuid')).toEqual({
                modelVisibility: {
                    google: { enabled: false },
                    openai: { enabled: false },
                    bedrock: { enabled: false },
                },
                keyAccessibleModelIds: { anthropic: null },
            });
        });
    });

    describe('getReviewJudgeAvailability', () => {
        const none = {
            hasActiveByoKey: false,
            canJudgeOnByoKey: false,
            byoJudgeProvider: null,
        };

        it('returns no BYO without an organization uuid', async () => {
            const resolver = makeResolver();
            expect(await resolver.getReviewJudgeAvailability(null)).toEqual(
                none,
            );
        });

        it('returns no BYO when there are no keys', async () => {
            const resolver = makeResolver({ orgKeys: null });
            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual(none);
        });

        it('judges on bedrock rather than the instance provider', async () => {
            const resolver = makeResolver({
                orgKeys: {
                    bedrock: {
                        apiKey: 'ABSK',
                        region: 'ap-northeast-1',
                        allowedModels: ['claude-sonnet-4-5'],
                    },
                },
            });
            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual({
                hasActiveByoKey: true,
                canJudgeOnByoKey: true,
                byoJudgeProvider: 'bedrock',
            });
        });

        it('can judge when the anthropic key serves haiku', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant-x' },
                accessibleModelIds: ['claude-haiku-4-5-20251001'],
            });
            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual({
                hasActiveByoKey: true,
                canJudgeOnByoKey: true,
                byoJudgeProvider: 'anthropic',
            });
        });

        it('cannot judge when the anthropic key lacks haiku', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant-x' },
                accessibleModelIds: ['claude-opus-4-8'],
            });
            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual({
                hasActiveByoKey: true,
                canJudgeOnByoKey: false,
                byoJudgeProvider: null,
            });
        });

        it('fails closed when the catalog returns null', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant-x' },
                accessibleModelIds: null,
            });
            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual({
                hasActiveByoKey: true,
                canJudgeOnByoKey: false,
                byoJudgeProvider: null,
            });
        });

        it('has an active key but cannot judge with only an openai key', async () => {
            const resolver = makeResolver({
                orgKeys: { openai: 'sk-x' },
            });
            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual({
                hasActiveByoKey: true,
                canJudgeOnByoKey: false,
                byoJudgeProvider: null,
            });
        });

        it('does not judge with a BYO Anthropic key through an instance gateway', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant-x' },
                accessibleModelIds: ['claude-haiku-4-5-20251001'],
                instanceConfig: anthropicGatewayConfig,
            });

            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual({
                hasActiveByoKey: true,
                canJudgeOnByoKey: false,
                byoJudgeProvider: null,
            });
        });
    });
});
