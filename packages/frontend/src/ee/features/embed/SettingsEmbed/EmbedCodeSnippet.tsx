import {
    assertUnreachable,
    FilterInteractivityValues,
    getFilterInteractivityValue,
    isChartContent,
    isDashboardContent,
    isDashboardUuidContent,
    type CreateEmbedJwt,
} from '@lightdash/common';
import { Anchor, Stack, Tabs, Text, Title } from '@mantine-8/core';
import { Prism } from '@mantine/prism';
import {
    IconBrandGolang,
    IconBrandNodejs,
    IconBrandPython,
} from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import useToaster from '../../../../hooks/toaster/useToaster';

export type EmbedMethod = 'iframe' | 'sdk';

// Not sure why lint-staged is removing the value of this enum.
// prettier-ignore
// eslint-disable-next-line
export enum SnippetLanguage {
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

const chartIframeCodeTemplates: Record<SnippetLanguage, string> = {
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

const dashboardIframeCodeTemplates: Record<SnippetLanguage, string> = {
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
            hidden: {{dashboardFiltersInteractivityHidden}},
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
            "hidden": {{dashboardFiltersInteractivityHidden}},
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
                Hidden bool \`json:"hidden"\`
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
                Hidden bool \`json:"hidden"\`
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
                Hidden bool \`json:"hidden"\`
            }{
                Enabled: "{{dashboardFiltersInteractivityEnabled}}",
                AllowedFilters: []string{{{dashboardFiltersInteractivityAllowedFilters}}},
                Hidden: {{dashboardFiltersInteractivityHidden}},
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

const chartSdkCodeTemplates: Record<SnippetLanguage, string> = {
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
const embedJwt = jwt.sign(data, LIGHTDASH_EMBED_SECRET, { expiresIn: '{{expiresIn}}' });
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
embedJwt = jwt.encode(data, key, algorithm="HS256")
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

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    embedJwt, err := token.SignedString([]byte(LIGHTDASH_EMBED_SECRET))
    if err != nil {
        panic(err)
    }

    fmt.Println("JWT:", embedJwt)
}
`,
};

const dashboardSdkCodeTemplates: Record<SnippetLanguage, string> = {
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
            hidden: {{dashboardFiltersInteractivityHidden}},
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
const embedJwt = jwt.sign(data, LIGHTDASH_EMBED_SECRET, { expiresIn: '{{expiresIn}}' });
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
            "hidden": {{dashboardFiltersInteractivityHidden}},
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
embedJwt = jwt.encode(data, key, algorithm="HS256")
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

    type CustomClaims struct {
        Content struct {
            Type                       string \`json:"type"\`
            ProjectUuid                string \`json:"projectUuid"\`
            DashboardUuid              string \`json:"dashboardUuid"\`
            DashboardFiltersInteractivity struct {
                Enabled string \`json:"enabled"\`
                AllowedFilters []string \`json:"allowedFilters,omitempty"\`
                Hidden bool \`json:"hidden"\`
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

    claims := CustomClaims{
        Content: struct {
            Type                       string \`json:"type"\`
            ProjectUuid                string \`json:"projectUuid"\`
            DashboardUuid              string \`json:"dashboardUuid"\`
            DashboardFiltersInteractivity struct {
                Enabled string \`json:"enabled"\`
                AllowedFilters []string \`json:"allowedFilters,omitempty"\`
                Hidden bool \`json:"hidden"\`
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
                Hidden bool \`json:"hidden"\`
            }{
                Enabled: "{{dashboardFiltersInteractivityEnabled}}",
                AllowedFilters: []string{{{dashboardFiltersInteractivityAllowedFilters}}},
                Hidden: {{dashboardFiltersInteractivityHidden}},
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

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    embedJwt, err := token.SignedString([]byte(LIGHTDASH_EMBED_SECRET))
    if err != nil {
        panic(err)
    }

    fmt.Println("JWT:", embedJwt)
}
`,
};

const getBackendCodeSnippet = (
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
    mode: EmbedMethod,
): string => {
    let codeTemplate;
    if (isDashboardContent(data.content)) {
        codeTemplate =
            mode === 'iframe'
                ? dashboardIframeCodeTemplates[language]
                : dashboardSdkCodeTemplates[language];
    } else {
        codeTemplate =
            mode === 'iframe'
                ? chartIframeCodeTemplates[language]
                : chartSdkCodeTemplates[language];
    }

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
                        ? data.content.dashboardUuid || '<DASHBOARD_UUID>'
                        : '<DASHBOARD_UUID>',
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
                    '{{dashboardFiltersInteractivityHidden}}',
                    languageBoolean(
                        language,
                        data.content.dashboardFiltersInteractivity?.hidden ??
                            false,
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
                    data.content.contentId || '<CHART_UUID>',
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

const getReactSdkFrontendSnippet = ({
    data,
    siteUrl,
}: {
    data: CreateEmbedJwt;
    siteUrl: string;
}): string => {
    const contentType = data.content.type;
    const dashboardCanUseFilters =
        isDashboardContent(data.content) &&
        data.content.dashboardFiltersInteractivity?.enabled ===
            FilterInteractivityValues.all;

    switch (contentType) {
        case 'dashboard':
            return `import '@lightdash/sdk/sdk.css';
import Lightdash from '@lightdash/sdk';

type EmbeddedDashboardProps = {
    embedJwt: string;
};

export const EmbeddedDashboard = ({ embedJwt }: EmbeddedDashboardProps) => (
    <Lightdash.Dashboard
        instanceUrl="${siteUrl}"
        token={embedJwt}${
            data.content.canExplore
                ? `
        onExplore={() => {
            // Optional: handle when users open a chart in explore
        }}`
                : ''
        }
        styles={{
            // Optional: customize supported SDK styles here:
            // backgroundColor: '#fff',
            // fontFamily: 'Inter, sans-serif',
        }}
${
    dashboardCanUseFilters
        ? `        // Optional: apply SDK filters.
        // To use this example, also import \`FilterOperator\` from \`@lightdash/sdk\`.
        /*
        filters={[
            {
                model: 'orders',
                field: 'status',
                operator: FilterOperator.EQUALS,
                value: 'completed',
            },
            {
                model: 'orders',
                field: 'created_date',
                operator: FilterOperator.IN_BETWEEN,
                value: ['2024-01-01', '2024-12-31'],
            },
        ]} */`
        : ''
}
    />
);
`;
        case 'chart':
            return `import '@lightdash/sdk/sdk.css';
import Lightdash from '@lightdash/sdk';

type EmbeddedChartProps = {
    embedJwt: string;
};

export const EmbeddedChart = ({ embedJwt }: EmbeddedChartProps) => (
    <Lightdash.Chart
        instanceUrl="${siteUrl}"
        token={embedJwt}
        id="${data.content.contentId || '<CHART_UUID>'}"
        styles={{
            // Optional: customize supported SDK styles here:
            // backgroundColor: '#fff',
            // fontFamily: 'Inter, sans-serif',
        }}
    />
);
`;
        default:
            return assertUnreachable(
                contentType,
                `Unsupported embedded content type ${contentType} frontend snippet`,
            );
    }
};

const CodeSnippetTabs: FC<{
    data: CreateEmbedJwt;
    mode: EmbedMethod;
    onCopySnippet: () => void;
    projectUuid: string;
    siteUrl: string;
}> = ({ data, mode, onCopySnippet, projectUuid, siteUrl }) => {
    return (
        <Tabs defaultValue="node">
            <Tabs.List>
                <Tabs.Tab
                    value="node"
                    leftSection={
                        <MantineIcon icon={IconBrandNodejs} size="sm" />
                    }
                >
                    NodeJS
                </Tabs.Tab>
                <Tabs.Tab
                    value="python"
                    leftSection={
                        <MantineIcon icon={IconBrandPython} size="sm" />
                    }
                >
                    Python
                </Tabs.Tab>
                <Tabs.Tab
                    value="go"
                    leftSection={
                        <MantineIcon icon={IconBrandGolang} size="sm" />
                    }
                >
                    Go
                </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="node" pt="xs">
                <Prism language="javascript" onCopy={onCopySnippet}>
                    {getBackendCodeSnippet(
                        SnippetLanguage.NODE,
                        {
                            projectUuid,
                            siteUrl,
                            data,
                        },
                        mode,
                    )}
                </Prism>
            </Tabs.Panel>

            <Tabs.Panel value="python" pt="xs">
                <Prism language="python" onCopy={onCopySnippet}>
                    {getBackendCodeSnippet(
                        SnippetLanguage.PYTHON,
                        {
                            projectUuid,
                            siteUrl,
                            data,
                        },
                        mode,
                    )}
                </Prism>
            </Tabs.Panel>

            <Tabs.Panel value="go" pt="xs">
                <Prism language="go" onCopy={onCopySnippet}>
                    {getBackendCodeSnippet(
                        SnippetLanguage.GO,
                        {
                            projectUuid,
                            siteUrl,
                            data,
                        },
                        mode,
                    )}
                </Prism>
            </Tabs.Panel>
        </Tabs>
    );
};

const EmbedCodeSnippet: FC<{
    mode: EmbedMethod;
    projectUuid: string;
    siteUrl: string;
    data: CreateEmbedJwt;
}> = ({ mode, projectUuid, siteUrl, data }) => {
    const { showToastSuccess } = useToaster();

    const handleCopySnippet = useCallback(() => {
        showToastSuccess({ title: 'Code snippet copied to clipboard!' });
    }, [showToastSuccess]);

    return (
        <Stack gap="md">
            <Stack gap="xs">
                <Title order={6}>
                    {mode === 'iframe'
                        ? 'Backend: generate JWT and embed URL'
                        : 'Backend: generate JWT'}
                </Title>
                <Text c="dimmed" fz="sm">
                    {mode === 'iframe'
                        ? 'Use this for iframe or direct embedding with a full embed URL.'
                        : 'Generate the embed JWT on your backend, then pass it to the React SDK from your frontend.'}
                </Text>
                <Text c="dimmed" fz="sm">
                    See the{' '}
                    <Anchor
                        href={
                            mode === 'iframe'
                                ? 'https://docs.lightdash.com/references/iframe-embedding'
                                : 'https://docs.lightdash.com/references/react-sdk#embedding-with-react-sdk'
                        }
                        target="_blank"
                    >
                        {mode === 'iframe'
                            ? 'iframe embed docs'
                            : 'React SDK docs'}
                    </Anchor>
                    .
                </Text>
            </Stack>

            <CodeSnippetTabs
                data={data}
                mode={mode}
                onCopySnippet={handleCopySnippet}
                projectUuid={projectUuid}
                siteUrl={siteUrl}
            />

            {mode === 'sdk' && (
                <Stack gap="xs">
                    <Stack gap="xs">
                        <Title order={6}>Frontend: mount React SDK</Title>
                        <Text c="dimmed" fz="sm">
                            Use <code>instanceUrl</code> for your Lightdash
                            domain and <code>token</code> for the JWT from your
                            backend.
                        </Text>
                    </Stack>
                    <Prism language="tsx" onCopy={handleCopySnippet}>
                        {getReactSdkFrontendSnippet({
                            data,
                            siteUrl,
                        })}
                    </Prism>
                </Stack>
            )}
        </Stack>
    );
};

export default EmbedCodeSnippet;
