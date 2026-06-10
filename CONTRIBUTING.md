# Contributing to Sherpa

Thanks for your interest in contributing! This file is a quick checklist — the full
contributor guide lives in [docs/contributing.md](docs/contributing.md).

## Quick start

```bash
git clone https://github.com/opsera-agentic/Sherpa.git
cd Sherpa
npm ci          # install workspace dependencies
npm run build   # build packages in dependency order
npm test        # run the full suite
npm run lint    # lint
```

Requires **Node.js 22+** and **npm 10+**.

## Before you open a pull request

- [ ] Branch off `main` (`feat/...` or `fix/...`).
- [ ] Code follows the module structure: logic in `core-*`, persistence in `infra-*`,
      CLI wiring in `cli-app` (see [docs/contributing.md](docs/contributing.md#module-structure)).
- [ ] New or materially changed source files have matching `*.test.ts` tests.
- [ ] `npm run build`, `npm run lint`, and `npm test` all pass locally.
- [ ] Docs updated for any user-visible behavior change.
- [ ] No secrets, tokens, or credentials committed.
- [ ] PR references the related issue and notes any breaking changes.

## Reporting issues

- **Bugs** and **feature requests** — use the templates when opening a
  [new issue](https://github.com/opsera-agentic/Sherpa/issues/new/choose).
- **Security vulnerabilities** — do **not** open a public issue; follow
  [SECURITY.md](SECURITY.md).

## Code of Conduct

This project is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating,
you agree to uphold it.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
