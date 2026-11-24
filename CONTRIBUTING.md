# Contributing

`main` is the only long-lived branch. Work happens on short-lived branches cut from it and merged
back into it through pull requests.

- **Branches:** `feature/<name>`, `bugfix/<name>` or `chore/<name>`, cut from `origin/main`, with
  lowercase letters, digits, dots and hyphens. CI's `branch-name` check fails anything else.
- **Commits** are signed, in the Conventional Commits style. User-facing changes go under
  `Unreleased` in `CHANGELOG.md`.
- **Pull requests** merge with a merge commit once the checks pass.
- **Before pushing:** `pnpm verify` (Biome, types, tests, and NOTICE against the dependencies).
  A new production dependency needs a line in `NOTICE`.
- **Releases:** bump `version` in `package.json`, move `Unreleased` to the new version, merge,
  then push a signed `vX.Y.Z` tag on `main`. CI publishes `vindotski/whoami:X.Y.Z` and creates
  the GitHub release.
- **License:** contributions are released into the public domain under the Unlicense.
