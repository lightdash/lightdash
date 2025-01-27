import {
    FilterInteractivityValues,
    getFilterInteractivityValue,
    type CreateEmbedJwt,
} from '@lightdash/common';
import { Tabs } from '@mantine/core';
import { Prism } from '@mantine/prism';
import React, { useCallback, type FC } from 'react';
import useToaster from '../../../../hooks/toaster/useToaster';

enum SnippetLanguage {
    NODE = 'node',
    PYTHON = 'python',
    GO = 'go',
}

const codeTemplates: Record<SnippetLanguage, string> = {
    [SnippetLanguage.NODE]: `import jwt from 'jsonwebtoken';
const LIGHTDASH_EMBED_SECRET = 'secret'; // replace with your secret
const projectUuid = '{{projectUuid}}';
const data = {
    content: {
        type: 'dashboard',
        dashboardUuid: '{{dashboardUuid}}',
        dashboardFiltersInteractivity: {
            enabled: "{{dashboardFiltersInteractivityEnabled}}",
            allowedFilters: {{dashboardFiltersInteractivityAllowedFilters}},
        },
        canExportCsv: {{canExportCsvEnabled}},
        canExportImages: {{canExportImagesEnabled}},
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
        "dashboardUuid": "{{dashboardUuid}}",
        "dashboardFiltersInteractivity": {
            "enabled": "{{dashboardFiltersInteractivityEnabledPython}}",
            "allowedFilters": {{dashboardFiltersInteractivityAllowedFiltersPython}},
        },
        "canExportCsv": {{canExportCsvEnabledPython}},
        "canExportImages": {{canExportImagesEnabledPython}},
    },
    "user": {
        "externalId": {{externalIdPython}}
        "email": {{emailPython}}
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
    {{externalIdGoDef}}
    {{emailGoDef}}

    // Define the custom claims structure
    type CustomClaims struct {
        Content struct {
            Type                       string \`json:"type"\`
            DashboardUuid              string \`json:"dashboardUuid"\`
            DashboardFiltersInteractivity struct {
                Enabled string \`json:"enabled"\`
                AllowedFilters []string \`json:"allowedFilters,omitempty"\`
            } \`json:"dashboardFiltersInteractivity"\`
            CanExportCsv bool \`json:"canExportCsv"\`
            CanExportImages bool \`json:"canExportImages"\`
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
            DashboardUuid              string \`json:"dashboardUuid"\`
            DashboardFiltersInteractivity struct {
                Enabled string \`json:"enabled"\`
                AllowedFilters []string \`json:"allowedFilters,omitempty"\`
            } \`json:"dashboardFiltersInteractivity"\`
            CanExportCsv bool \`json:"canExportCsv"\`
            CanExportImages bool \`json:"canExportImages"\`
        }{
            Type:          "dashboard",
            DashboardUuid: "{{dashboardUuid}}",
            DashboardFiltersInteractivity: struct {
                Enabled string \`json:"enabled"\`
                AllowedFilters []string \`json:"allowedFilters,omitempty"\`
            }{
                Enabled: "{{dashboardFiltersInteractivityEnabled}}",
                AllowedFilters: []string{{{dashboardFiltersInteractivityAllowedFiltersGo}}},
            },
            CanExportCsv: {{canExportCsvEnabled}},
            CanExportImages: {{canExportImagesEnabled}},
        },
        User: &struct {
            ExternalId *string \`json:"externalId,omitempty"\`
            Email      *string \`json:"email,omitempty"\`
        }{
            ExternalId: {{externalIdGo}}, // Or point to a string variable
            Email:      {{emailGo}},
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
) => {
    return codeTemplates[language]
        .replace('{{projectUuid}}', projectUuid)
        .replace('{{siteUrl}}', siteUrl)
        .replace('{{expiresIn}}', data.expiresIn || '1 hour')
        .replace(
            '{{dashboardUuid}}',
            data.content.dashboardUuid || '{{your dashboard uuid}}',
        )
        .replace(
            '{{userAttributes}}',
            JSON.stringify(data.userAttributes || {}),
        )
        .replace(
            '{{dashboardFiltersInteractivityEnabled}}',
            data.content.dashboardFiltersInteractivity
                ? getFilterInteractivityValue(
                      data.content.dashboardFiltersInteractivity.enabled,
                  )
                : FilterInteractivityValues.none,
        )
        .replace(
            '{{dashboardFiltersInteractivityAllowedFilters}}',
            JSON.stringify(
                data.content.dashboardFiltersInteractivity?.allowedFilters,
            ),
        )
        .replace(
            '{{dashboardFiltersInteractivityEnabledPython}}',
            data.content.dashboardFiltersInteractivity
                ? getFilterInteractivityValue(
                      data.content.dashboardFiltersInteractivity.enabled,
                  )
                : FilterInteractivityValues.none,
        )
        .replace(
            '{{dashboardFiltersInteractivityAllowedFiltersPython}}',
            JSON.stringify(
                data.content.dashboardFiltersInteractivity?.allowedFilters,
            ) || 'None',
        )
        .replace(
            '{{dashboardFiltersInteractivityAllowedFiltersGo}}',
            data.content.dashboardFiltersInteractivity?.allowedFilters
                ? `"${data.content.dashboardFiltersInteractivity?.allowedFilters?.join(
                      '","',
                  )}"`
                : 'nil',
        )
        .replace(
            '{{canExportCsvEnabled}}',
            data.content.canExportCsv ? 'true' : 'false',
        )
        .replace(
            '{{canExportCsvEnabledPython}}',
            data.content.canExportCsv ? 'True' : 'False',
        )
        .replace(
            '{{canExportImagesEnabled}}',
            data.content.canExportImages ? 'true' : 'false',
        )
        .replace(
            '{{canExportImagesEnabledPython}}',
            data.content.canExportImages ? 'True' : 'False',
        )
        .replace(
            '{{externalId}}',
            data.user?.externalId ? `"${data.user?.externalId}"` : 'undefined',
        )
        .replace(
            '{{externalIdPython}}',
            data.user?.externalId ? `"${data.user?.externalId}"` : 'None',
        )
        .replace(
            '{{externalIdGoDef}}',
            data.user?.externalId
                ? `externalId := "${data.user?.externalId}"`
                : '',
        )
        .replace(
            '{{externalIdGo}}',
            data.user?.externalId ? `&externalId` : 'nil',
        )
        .replace(
            '{{email}}',
            data.user?.email ? `"${data.user?.email}"` : 'undefined',
        )
        .replace(
            '{{emailPython}}',
            data.user?.email ? `"${data.user?.email}"` : 'None',
        )
        .replace(
            '{{emailGoDef}}',
            data.user?.email ? `email := "${data.user?.email}"` : '',
        )
        .replace('{{emailGo}}', data.user?.email ? `&email` : 'nil');
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
