module.exports = {
  branches: [
    "+([0-9])?(.{+([0-9]),x}).x",
    "main",
    "next",
    "next-major",
    { name: "beta", prerelease: true },
    { name: "alpha", prerelease: true },
  ],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    [
      "@semantic-release/changelog",
      {
        changelogFile: "CHANGELOG.md",
      },
    ],
    [
      "@amanda-mitchell/semantic-release-npm-multiple",
      {
        registries: {
          main: {
            npmPublish: false,
            pkgRoot: ".",
          },
          common: {
            npmPublish: true,
            pkgRoot: "packages/common",
          },
          backend: {
            npmPublish: false,
            pkgRoot: "packages/backend",
          },
          frontend: {
            npmPublish: false,
            pkgRoot: "packages/frontend",
          },
          e2e: {
            npmPublish: false,
            pkgRoot: "packages/e2e",
          },
          warehouses: {
            npmPublish: true,
            pkgRoot: "packages/warehouses",
          },
          cli: {
            npmPublish: true,
            pkgRoot: "packages/cli",
          },
        },
      },
    ],
    [
      "@google/semantic-release-replace-plugin",
      {
        replacements: [
          {
            files: [
              "packages/backend/package.json",
              "packages/e2e/package.json",
              "packages/frontend/package.json",
              "packages/warehouses/package.json",
              "packages/cli/package.json",
            ],
            from: '"@lightdash/common": "\\^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?"',
            to: '"@lightdash/common": "^${nextRelease.version}"',
            results: [
              {
                file: "packages/backend/package.json",
                hasChanged: true,
                numMatches: 1,
                numReplacements: 1,
              },
              {
                file: "packages/e2e/package.json",
                hasChanged: true,
                numMatches: 1,
                numReplacements: 1,
              },
              {
                file: "packages/frontend/package.json",
                hasChanged: true,
                numMatches: 1,
                numReplacements: 1,
              },
              {
                file: "packages/warehouses/package.json",
                hasChanged: true,
                numMatches: 1,
                numReplacements: 1,
              },
              {
                file: "packages/cli/package.json",
                hasChanged: true,
                numMatches: 1,
                numReplacements: 1,
              },
            ],
            countMatches: true,
          },
          {
            files: [
              "packages/backend/package.json",
              "packages/cli/package.json",
            ],
            from: '"@lightdash/warehouses": "\\^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?"',
            to: '"@lightdash/warehouses": "^${nextRelease.version}"',
            results: [
              {
                file: "packages/backend/package.json",
                hasChanged: true,
                numMatches: 1,
                numReplacements: 1,
              },
              {
                file: "packages/cli/package.json",
                hasChanged: true,
                numMatches: 1,
                numReplacements: 1,
              },
            ],
            countMatches: true,
          },
        ],
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: [
          "CHANGELOG.md",
          "package.json",
          "packages/common/package.json",
          "packages/backend/package.json",
          "packages/frontend/package.json",
          "packages/e2e/package.json",
          "packages/cli/package.json",
          "packages/warehouses/package.json",
        ],
        message:
          "chore(release): ${nextRelease.version} \n\n${nextRelease.notes}",
      },
    ],
    ["@semantic-release/github", {}],
  ],
  tagFormat: "${version}",
};
