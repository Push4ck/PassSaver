# Contributing to PassSaver

Thanks for your interest in contributing.

## Development setup

1. Fork the repository
1. Create a feature branch from `main`
1. Install dependencies:

```bash
npm install
```

1. Start the app:

```bash
npm start
```

## Branch and PR guidelines

- Keep PRs focused and small
- Add a clear description of what changed and why
- Include manual test steps
- Avoid unrelated formatting or refactor-only noise in feature PRs

## Code expectations

- Follow existing TypeScript and React Native style in the repo
- Prefer readable and maintainable code over clever shortcuts
- Add loading states for async actions that can take noticeable time
- Avoid introducing plaintext storage for sensitive vault data

## Security notes

PassSaver is a security-sensitive app. For any change touching encryption, biometrics, storage, or import/export:

- call out the risk clearly in the PR description
- mention migration impact (if any)
- include before/after behavior notes

## Reporting issues

When filing an issue, include:

- platform and OS version
- app version / commit hash
- exact reproduction steps
- expected vs actual behavior
- screenshots/logs if possible
