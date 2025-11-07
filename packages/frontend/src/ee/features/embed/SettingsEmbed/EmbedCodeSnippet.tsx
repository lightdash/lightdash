import {
    assertUnreachable,
    FilterInteractivityValues,
    getFilterInteractivityValue,
    isChartContent,
    isDashboardContent,
    isDashboardUuidContent,
    type CreateEmbedJwt,
} from '@lightdash/common';
import { Tabs } from '@mantine/core';
import { Prism } from '@mantine/prism';
import { useCallback, type FC } from 'react';
import useToaster from '../../../../hooks/toaster/useToaster';

// Not sure why lint-staged is removing the value of this enum.
// prettier-ignore
// eslint-disable-next-line
enum SnippetLanguage {
    NODE = 'node',
    PYTHON = 'python',
    GO = 'go',
}

// Helper functions to convert values to language-specific formats
const languageUndefined = (language: SnippetLanguage): string => {
    switch (language) {
        case SnippetLanguage.NODE:
            return 'undefined';
        case SnippetLanguage.PYTHON:
        case SnippetLanguage.GO:
            return 'None';
        default:
            return assertUnreachable(language, `Unknown language ${language}`);
    }
};

const languageBoolean = (
    language: SnippetLanguage,
    value?: boolean,
): string => {
    if (value === undefined) {
        return languageUndefined(language);
    }
    switch (language) {
        case SnippetLanguage.NODE:
        case SnippetLanguage.GO:
            return value ? 'true' : 'false';
        case SnippetLanguage.PYTHON:
            return value ? 'True' : 'False';
        default:
            return assertUnreachable(language, `Unknown language ${language}`);
    }
};

const languageString = (language: SnippetLanguage, value?: string): string => {
    if (value === undefined || value === null) {
        return languageUndefined(language);
    }
    return `"${value}"`;
};

const languageOptionalStringForGo = (
    language: SnippetLanguage,
    value?: string,
): { definition: string; usage: string } => {
    if (language !== SnippetLanguage.GO) {
        return { definition: '', usage: languageString(language, value) };
    }

    if (!value) {
        return { definition: '', usage: 'nil' };
    }

    const varName = value.includes('@') ? 'email' : 'externalId';
    return {
        definition: `${varName} := "${value}"`,
        usage: `&${varName}`,
    };
};

const languageStringArray = (
    language: SnippetLanguage,
    values?: string[] | null,
): string => {
    if (!values || values.length === 0) {
        switch (language) {
            case SnippetLanguage.NODE:
            case SnippetLanguage.PYTHON:
                return '[]';
            case SnippetLanguage.GO:
                return '';
            default:
                return assertUnreachable(
                    language,
                    `Unknown language ${language}`,
                );
        }
    }
    switch (language) {
        case SnippetLanguage.NODE:
        case SnippetLanguage.PYTHON:
            return JSON.stringify(values);
        case SnippetLanguage.GO:
            return `"${values.join('","')}"`;
        default:
            return assertUnreachable(language, `Unknown language ${language}`);
    }
};

const chartCodeTemplates: Record<SnippetLanguage, string> = {
    [SnippetLanguage.NODE]: `import jwt from 'jsonwebtoken';
const LIGHTDASH_EMBED_SECRET = 'secret'; // replace with your secret
const projectUuid = '{{projectUuid}}';
const data = {
    content: {
        type: 'chart',
        projectUuid: projectUuid,
        contentId: '{{chartUuid}}',
        canExportCsv: {{canExportCsv}},
        canExportImages: {{canExportImages}},
        canViewUnderlyingData: {{canViewUnderlyingData}},
    },
    user: {
        externalId: {{externalId}},
        email: {{email}}
    },
    userAttributes: {{userAttributes}},
};
const token = jwt.sign(data, LIGHTDASH_EMBED_SECRET, { expiresIn: '{{expiresIn}}' });
const url = \`{{siteUrl}}/embed/\${projectUuid}#\${token}\`;
`,
    [SnippetLanguage.PYTHON]: `import datetime
import jwt # pip install pyjwt

key = "secret" # replace with your secret
projectUuid = '{{projectUuid}}'

data = {
    "exp": datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(hours=1), # replace with your expiration time,
    "iat": datetime.datetime.now(tz=datetime.timezone.utc),
    "content": {
        "type": "chart",
        "projectUuid": projectUuid,
        "contentId": "{{chartUuid}}",
        "canExportCsv": {{canExportCsv}},
        "canExportImages": {{canExportImages}},
        "canViewUnderlyingData": {{canViewUnderlyingData}},
    },
    "user": {
        "externalId": {{externalId}},
        "email": {{email}}
    },
    "userAttributes": {{userAttributes}},
};
token = jwt.encode(data, key, algorithm="HS256")
url = f"{{siteUrl}}/embed/{projectUuid}#{token}"
`,
    [SnippetLanguage.GO]: `
package main

import (
    "fmt"
    "time"

    jwt "github.com/dgrijalva/jwt-go"
)

const LIGHTDASH_EMBED_SECRET = "secret" // replace with your secret
const projectUuid = "{{projectUuid}}"

func main() {
    {{externalIdDef}}
    {{emailDef}}

    // Define the custom claims structure
    type CustomClaims struct {
        Content struct {
            Type                  string \`json:"type"\`
            ProjectUuid           string \`json:"projectUuid"\`
            ContentId             string \`json:"contentId"\`
            CanExportCsv          bool \`json:"canExportCsv"\`
            CanExportImages       bool \`json:"canExportImages"\`
            CanViewUnderlyingData bool \`json:"canViewUnderlyingData"\`
        } \`json:"content"\`
        UserAttributes map[string]string \`json:"userAttributes"\`
        jwt.StandardClaims
        User *struct {
            ExternalId *string \`json:"externalId,omitempty"\`
            Email      *string \`json:"email,omitempty"\`
        } \`json:"user,omitempty"\`
    }

    // Create the claims
    claims := CustomClaims{
        Content: struct {
            Type                  string \`json:"type"\`
            ProjectUuid           string \`json:"projectUuid"\`
            ContentId             string \`json:"contentId"\`
            CanExportCsv          bool \`json:"canExportCsv"\`
            CanExportImages       bool \`json:"canExportImages"\`
            CanViewUnderlyingData bool \`json:"canViewUnderlyingData"\`
        }{
            Type:                  "chart",
            ProjectUuid:           projectUuid,
            ContentId:             "{{chartUuid}}",
            CanExportCsv:          {{canExportCsv}},
            CanExportImages:       {{canExportImages}},
            CanViewUnderlyingData: {{canViewUnderlyingData}},
        },
        User: &struct {
            ExternalId *string \`json:"externalId,omitempty"\`
            Email      *string \`json:"email,omitempty"\`
        }{
            ExternalId: {{externalIdUsage}},
            Email:      {{emailUsage}},
        },
        UserAttributes: map[string]string{{userAttributes}},
        StandardClaims: jwt.StandardClaims{
            ExpiresAt: time.Now().Add(time.Hour).Unix(), // replace with your expiration
        },
    }

    // Create the token
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

    // Sign the token with the secret
    signedToken, err := token.SignedString([]byte(LIGHTDASH_EMBED_SECRET))
    if err != nil {
        panic(err)
    }

    // Construct the URL
    url := fmt.Sprintf("{{siteUrl}}/embed/%s#%s", projectUuid, signedToken)
    fmt.Println("URL:", url)

}
`,
};

const dashboardCodeTemplates: Record<SnippetLanguage, string> = {
    [SnippetLanguage.NODE]: `import jwt from 'jsonwebtoken';
const LIGHTDASH_EMBED_SECRET = 'secret'; // replace with your secret
const projectUuid = '{{projectUuid}}';
const data = {
    content: {
        type: 'dashboard',
        projectUuid: projectUuid,
        dashboardUuid: '{{dashboardUuid}}',
        dashboardFiltersInteractivity: {
            enabled: "{{dashboardFiltersInteractivityEnabled}}",
            allowedFilters: {{dashboardFiltersInteractivityAllowedFilters}},
        },
        parameterInteractivity: {
            enabled: {{canChangeParameters}},
        },
        canExportCsv: {{canExportCsv}},
        canExportImages: {{canExportImages}},
        canExportPagePdf: {{canExportPagePdf}},
        canDateZoom: {{canDateZoom}},
        canExplore: {{canExplore}},
        canViewUnderlyingData: {{canViewUnderlyingData}},
    },
    user: {
        externalId: {{externalId}},
        email: {{email}}
    },
    userAttributes: {{userAttributes}},
};
const token = jwt.sign(data, LIGHTDASH_EMBED_SECRET, { expiresIn: '{{expiresIn}}' });
const url = \`{{siteUrl}}/embed/\${projectUuid}#\${token}\`;
`,
    [SnippetLanguage.PYTHON]: `import datetime
import jwt # pip install pyjwt

key = "secret" # replace with your secret
projectUuid = '{{projectUuid}}'

data = {
    "exp": datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(hours=1), # replace with your expiration time,
    "iat": datetime.datetime.now(tz=datetime.timezone.utc),
    "content": {
        "type": "dashboard",
        "projectUuid": projectUuid,
        "dashboardUuid": "{{dashboardUuid}}",
        "dashboardFiltersInteractivity": {
            "enabled": "{{dashboardFiltersInteractivityEnabled}}",
            "allowedFilters": {{dashboardFiltersInteractivityAllowedFilters}},
        },
        "parameterInteractivity": {
            "enabled": {{canChangeParameters}},
        },
        "canExportCsv": {{canExportCsv}},
        "canExportImages": {{canExportImages}},
        "canExportPagePdf": {{canExportPagePdf}},
        "canDateZoom": {{canDateZoom}},
        "canExplore": {{canExplore}},
        "canViewUnderlyingData": {{canViewUnderlyingData}},
    },
    "user": {
        "externalId": {{externalId}},
        "email": {{email}}
    },
    "userAttributes": {{userAttributes}},
};
token = jwt.encode(data, key, algorithm="HS256")
url = f"{{siteUrl}}/embed/{projectUuid}#{token}"
`,
    [SnippetLanguage.GO]: `
package main

import (
    "fmt"
    "time"

    jwt "github.com/dgrijalva/jwt-go"
)

const LIGHTDASH_EMBED_SECRET = "secret" // replace with your secret
const projectUuid = "{{projectUuid}}"

func main() {
    {{externalIdDef}}
    {{emailDef}}

    // Define the custom claims structure
    type CustomClaims struct {
        Content struct {
            Type                       string \`json:"type"\`
            ProjectUuid                string \`json:"projectUuid"\`
            DashboardUuid              string \`json:"dashboardUuid"\`
            DashboardFiltersInteractivity struct {
                Enabled string \`json:"enabled"\`
                AllowedFilters []string \`json:"allowedFilters,omitempty"\`
            } \`json:"dashboardFiltersInteractivity"\`
            ParameterInteractivity struct {
                Enabled bool \`json:"enabled"\`
            } \`json:"parameterInteractivity"\`
            CanExportCsv bool \`json:"canExportCsv"\`
            CanExportImages bool \`json:"canExportImages"\`
            CanExportPagePdf bool \`json:"canExportPagePdf"\`
            CanDateZoom bool \`json:"canDateZoom"\`
            CanExplore bool \`json:"canExplore"\`
            CanViewUnderlyingData bool \`json:"canViewUnderlyingData"\`
        } \`json:"content"\`
        UserAttributes map[string]string \`json:"userAttributes"\`
        jwt.StandardClaims
        User *struct {
            ExternalId *string \`json:"externalId,omitempty"\`
            Email      *string \`json:"email,omitempty"\`
        } \`json:"user,omitempty"\`
    }

    // Create the claims
    claims := CustomClaims{
        Content: struct {
            Type                       string \`json:"type"\`
            ProjectUuid                string \`json:"projectUuid"\`
            DashboardUuid              string \`json:"dashboardUuid"\`
            DashboardFiltersInteractivity struct {
                Enabled string \`json:"enabled"\`
                AllowedFilters []string \`json:"allowedFilters,omitempty"\`
            } \`json:"dashboardFiltersInteractivity"\`
            ParameterInteractivity struct {
                Enabled bool \`json:"enabled"\`
            } \`json:"parameterInteractivity"\`
            CanExportCsv bool \`json:"canExportCsv"\`
            CanExportImages bool \`json:"canExportImages"\`
            CanExportPagePdf bool \`json:"canExportPagePdf"\`
            CanDateZoom bool \`json:"canDateZoom"\`
            CanExplore bool \`json:"canExplore"\`
            CanViewUnderlyingData bool \`json:"canViewUnderlyingData"\`
        }{
            Type:          "dashboard",
            ProjectUuid:   projectUuid,
            DashboardUuid: "{{dashboardUuid}}",
            DashboardFiltersInteractivity: struct {
                Enabled string \`json:"enabled"\`
                AllowedFilters []string \`json:"allowedFilters,omitempty"\`
            }{
                Enabled: "{{dashboardFiltersInteractivityEnabled}}",
                AllowedFilters: []string{{{dashboardFiltersInteractivityAllowedFilters}}},
            },
            ParameterInteractivity: struct {
                Enabled bool \`json:"enabled"\`
            }{
                Enabled: {{canChangeParameters}},
            },
            CanExportCsv: {{canExportCsv}},
            CanExportImages: {{canExportImages}},
            CanExportPagePdf: {{canExportPagePdf}},
            CanDateZoom: {{canDateZoom}},
            CanExplore: {{canExplore}},
            CanViewUnderlyingData: {{canViewUnderlyingData}},
        },
        User: &struct {
            ExternalId *string \`json:"externalId,omitempty"\`
            Email      *string \`json:"email,omitempty"\`
        }{
            ExternalId: {{externalIdUsage}},
            Email:      {{emailUsage}},
        },
        UserAttributes: map[string]string{{userAttributes}},
        StandardClaims: jwt.StandardClaims{
            ExpiresAt: time.Now().Add(time.Hour).Unix(), // replace with your expiration
        },
    }

    // Create the token
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

    // Sign the token with the secret
    signedToken, err := token.SignedString([]byte(LIGHTDASH_EMBED_SECRET))
    if err != nil {
        panic(err)
    }

    // Construct the URL
    url := fmt.Sprintf("{{siteUrl}}/embed/%s#%s", projectUuid, signedToken)
    fmt.Println("URL:", url)

}
`,
};

const getCodeSnippet = (
    language: SnippetLanguage,
    {
        projectUuid,
        siteUrl,
        data,
    }: {
        projectUuid: string;
        siteUrl: string;
        data: CreateEmbedJwt;
    },
): string => {
    let codeTemplate = isDashboardContent(data.content)
        ? dashboardCodeTemplates[language]
        : chartCodeTemplates[language];

    // Handle Go-specific user field placeholders
    const externalIdForGo = languageOptionalStringForGo(
        language,
        data.user?.externalId,
    );
    const emailForGo = languageOptionalStringForGo(language, data.user?.email);

    // Replace common snippet variables for chart and dashboard
    codeTemplate = codeTemplate
        .replace('{{projectUuid}}', projectUuid)
        .replace('{{siteUrl}}', siteUrl)
        .replace('{{expiresIn}}', data.expiresIn || '1 hour')
        .replace(
            '{{userAttributes}}',
            JSON.stringify(data.userAttributes || {}),
        )
        .replace(
            '{{externalId}}',
            languageString(language, data.user?.externalId),
        )
        .replace('{{externalIdDef}}', externalIdForGo.definition)
        .replace('{{externalIdUsage}}', externalIdForGo.usage)
        .replace('{{email}}', languageString(language, data.user?.email))
        .replace('{{emailDef}}', emailForGo.definition)
        .replace('{{emailUsage}}', emailForGo.usage)
        .replace(
            '{{canViewUnderlyingData}}',
            languageBoolean(language, data.content.canViewUnderlyingData),
        )
        .replace(
            '{{canExportCsv}}',
            languageBoolean(language, data.content.canExportCsv),
        )
        .replace(
            '{{canExportImages}}',
            languageBoolean(language, data.content.canExportImages),
        );

    const contentType = data.content.type;
    switch (contentType) {
        case 'dashboard':
            // Replace dashboard specific variables
            codeTemplate = codeTemplate
                .replace(
                    '{{dashboardUuid}}',
                    isDashboardUuidContent(data.content)
                        ? data.content.dashboardUuid
                        : '{{your dashboard uuid}}',
                )
                .replace(
                    '{{dashboardFiltersInteractivityEnabled}}',
                    data.content.dashboardFiltersInteractivity
                        ? getFilterInteractivityValue(
                              data.content.dashboardFiltersInteractivity
                                  .enabled,
                          )
                        : FilterInteractivityValues.none,
                )
                .replace(
                    '{{dashboardFiltersInteractivityAllowedFilters}}',
                    languageStringArray(
                        language,
                        data.content.dashboardFiltersInteractivity
                            ?.allowedFilters,
                    ),
                )
                .replace(
                    '{{canChangeParameters}}',
                    languageBoolean(
                        language,
                        data.content.parameterInteractivity?.enabled,
                    ),
                )
                .replace(
                    '{{canExportPagePdf}}',
                    languageBoolean(language, data.content.canExportPagePdf),
                )
                .replace(
                    '{{canDateZoom}}',
                    languageBoolean(language, data.content.canDateZoom),
                )
                .replace(
                    '{{canExplore}}',
                    languageBoolean(language, data.content.canExplore),
                );
            break;
        case 'chart':
            // Replace chart specific variables
            if (isChartContent(data.content)) {
                codeTemplate = codeTemplate.replace(
                    '{{chartUuid}}',
                    data.content.contentId,
                );
            }
            break;
        default:
            assertUnreachable(
                contentType,
                `Unsupported embedded content type ${contentType} snippet`,
            );
    }

    return codeTemplate;
};

const EmbedCodeSnippet: FC<{
    projectUuid: string;
    siteUrl: string;
    data: CreateEmbedJwt;
}> = ({ projectUuid, siteUrl, data }) => {
    const { showToastSuccess } = useToaster();

    const handleCopySnippet = useCallback(() => {
        showToastSuccess({ title: 'Code snippet copied to clipboard!' });
    }, [showToastSuccess]);

    return (
        <Tabs defaultValue="node">
            <Tabs.List>
                <Tabs.Tab value="node">NodeJS</Tabs.Tab>
                <Tabs.Tab value="python">Python</Tabs.Tab>
                <Tabs.Tab value="go">Go</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="node" pt="xs">
                <Prism language="javascript" onCopy={handleCopySnippet}>
                    {getCodeSnippet(SnippetLanguage.NODE, {
                        projectUuid,
                        siteUrl,
                        data,
                    })}
                </Prism>
            </Tabs.Panel>

            <Tabs.Panel value="python" pt="xs">
                <Prism language="python" onCopy={handleCopySnippet}>
                    {getCodeSnippet(SnippetLanguage.PYTHON, {
                        projectUuid,
                        siteUrl,
                        data,
                    })}
                </Prism>
            </Tabs.Panel>

            <Tabs.Panel value="go" pt="xs">
                <Prism language="go" onCopy={handleCopySnippet}>
                    {getCodeSnippet(SnippetLanguage.GO, {
                        projectUuid,
                        siteUrl,
                        data,
                    })}
                </Prism>
            </Tabs.Panel>
        </Tabs>
    );
};

export default EmbedCodeSnippet;
