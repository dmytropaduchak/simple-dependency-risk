# simple-dependency-risk

Reads the pull request diff for dependency changes (e.g. `package.json`) and warns on major version bumps and auth-sensitive package updates.

## What it checks

- Major semver bumps (`1.x` → `2.x`)
- Auth-related packages (`jsonwebtoken`, `passport`, `next-auth`, `bcrypt`, …)

## Usage

```yaml
name: Dependency risk
on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  simple-dependency-risk:
    runs-on: ubuntu-latest
    steps:
      - uses: dmytropaduchak/simple-dependency-risk@v0.1.0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `github-token` | `${{ github.token }}` | Read PR diff + post comments |
| `fail-on` | `none` | `none` / `medium` / `high` |

## Develop

```bash
npm install && npm run build
```
