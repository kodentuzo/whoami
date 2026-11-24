# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **The repository moved** from `kodentuzo/whoami` to `vindotski/whoami`. GitHub redirects the old
  URL; the docs, `NOTICE` and the page's link now name the new one.
- **The image is published as `vindotski/whoami`**, not `kodentuzo/whoami`, because a repository
  of the owner's own account no longer gets the organisation's Docker Hub settings. CI needs the
  repository variable `DOCKERHUB_USERNAME` and the secret `DOCKERHUB_TOKEN` on `vindotski/whoami`
  to push a tag. Versions 0.1.0 and 0.2.0 are on Docker Hub as `vindotski/whoami` already.

## [0.2.0] - 2026-11-22

### Changed

- Analytics: works with Spotless (Spotcraft 0.15): no website id needed, and the check sends one
  test event, `whoami-check`, so it shows in the dashboard's events. Older instances still work.

## [0.1.0] - 2026-11-22

### Added

- One page that checks a Spotcraft instance: HTTPS, the platform environment, the database and
  its migration, the mail relay with a test email, the user pool, the legal facts and analytics.
  The same report as JSON.
- The image `vindotski/whoami`, with Spotcraft's migrate label and a health check.

[Unreleased]: https://github.com/vindotski/whoami/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/vindotski/whoami/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/vindotski/whoami/releases/tag/v0.1.0
