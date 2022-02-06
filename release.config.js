module.exports = {
  'branches': ['+([0-9])?(.{+([0-9]),x}).x', 'main', 'next', 'next-major', {name: 'beta', prerelease: true}, {name: 'alpha', prerelease: true}],
  'plugins': [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/changelog',
      {
        'changelogFile': 'CHANGELOG.md',
      }
    ],
    [
      '@amanda-mitchell/semantic-release-npm-multiple',
      {
        'registries': {
          'main':{
            'npmPublish': false,
            'pkgRoot': '.'
          },
          'common': {
            'npmPublish': false,
            'pkgRoot': 'packages/common'
          },
          'backend': {
            'npmPublish': false,
            'pkgRoot': 'packages/backend'
          },
          'frontend': {
            'npmPublish': false,
            'pkgRoot': 'packages/frontend'
          },
          'e2e': {
            'npmPublish': false,
            'pkgRoot': 'packages/e2e'
          }
        }
      }
    ],
    [
      '@semantic-release/git',
      {
        'assets': [
          'CHANGELOG.md',
          'package.json',
          'packages/common/package.json',
          'packages/backend/package.json',
          'packages/frontend/package.json',
          'packages/e2e/package.json'
        ],
        'message': 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      }
    ],
    [
      '@semantic-release/github',
      {},
    ],
  ],
  'tagFormat': '${version}',
};


