# Contributing to sql-connector

Thanks for your interest in contributing to sql-connector! This document
explains how to set up the project and submit changes.

By participating in this project, you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Getting started

1. Fork the repository and clone your fork:

   ```bash
   git clone https://github.com/<your-username>/sql-connector.git
   cd sql-connector
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a branch for your change:

   ```bash
   git checkout -b feature/my-change
   ```

## Development workflow

- Source code lives in `src/`.
- Tests live in `tests/`.
- Utility scripts live in `scripts/`.

### Linting

The project uses ESLint (`eslint.config.mjs`). Before committing, run:

```bash
npm run lint
```

Fix any reported issues, or run the auto-fixer if one is configured:

```bash
npm run lint -- --fix
```

### Tests

Please add or update tests in `tests/` for any behavior you change or add.
Run the test suite with:

```bash
npm test
```

All tests must pass before a pull request will be merged.

## Commit messages

Write clear, descriptive commit messages. Prefer the imperative mood
(e.g. "Add support for LEFT JOIN", not "Added" or "Adding").

## Submitting a pull request

1. Make sure your branch is up to date with `main`:

   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. Push your branch and open a pull request against `main`.
3. In the pull request description, explain:
   - What the change does and why
   - How it was tested
   - Any breaking changes
4. Link any related issues.
5. Be responsive to review feedback — a maintainer may ask for changes
   before merging.

## Reporting bugs

When filing a bug report, please include:

- The version of sql-connector you're using
- A minimal code sample that reproduces the issue
- What you expected to happen vs. what actually happened
- Any relevant error messages or stack traces

## Suggesting features

Feature requests are welcome. Please open an issue describing:

- The problem you're trying to solve
- Your proposed solution or API
- Any alternatives you've considered

## Documentation

If your change affects the public API (`Schema`, `Model`, `connect`, etc.),
please update `README.md` accordingly. If you can also update the French
documentation in `docs/fr/README.md`, that's appreciated but not required.

## License

By contributing, you agree that your contributions will be licensed under
the project's [MIT License](LICENSE).
