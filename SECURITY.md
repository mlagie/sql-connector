# Security Policy

## Supported Versions

Only the versions below currently receive security fixes. Since sql-connector
follows semantic versioning, please make sure you're on the latest `3.x`
release before reporting an issue — it may already be fixed.

| Version | Supported          |
| ------- | ------------------ |
| 3.x     | :white_check_mark: |
| 2.x     | :x:                |
| < 2.0   | :x:                |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**
Publicly disclosing a vulnerability before a fix is available puts every
user of the package at risk.

Instead, report it privately by emailing **mlagie.coc@gmail.com** with:

- A description of the vulnerability and its potential impact
- Steps to reproduce it (a minimal code sample is ideal, especially since
  `customRequest` and raw `where` conditions interact directly with SQL)
- The affected version(s)
- Any suggested fix or mitigation, if you have one

You can also report privately through
[GitHub's private vulnerability reporting](https://github.com/mlagie/sql-connector/security/advisories/new)
if it is enabled for this repository.

### What to expect

- **Acknowledgment**: within 72 hours of your report.
- **Status updates**: at least every 7 days while the issue is investigated,
  even if there's nothing new to share.
- **Timeline to a fix**: we aim to release a patch within 30 days for
  confirmed vulnerabilities, depending on severity and complexity.

### If the report is accepted

- A fix will be prepared and released as a new patch or minor version.
- A GitHub Security Advisory will be published once the fix is available,
  crediting you for the discovery unless you prefer to remain anonymous.
- You'll be notified before the advisory goes public.

### If the report is declined

- We'll explain why (e.g. not a security issue, expected behavior, or
  out of scope — see below) and, where relevant, suggest an alternative
  way to raise the concern (bug report, discussion, etc.).

## Scope

Examples of issues in scope for this policy:

- SQL injection through `Schema`, `Model.find`, `where` clauses, `join`
  options, or any other query-building path
- Ways to bypass `required`, `unique`, or other schema constraints that
  have security implications
- Credential or connection-config leakage (e.g. in logs or error messages)
- Denial-of-service issues triggerable via crafted input

Out of scope:

- Vulnerabilities in MySQL itself or in dependencies like `mysql2` (please
  report those upstream)
- Issues that require an already-compromised database or full control over
  the `customRequest` input in a trusted context (this function intentionally
  executes raw SQL you provide)

## Disclosure Policy

We follow coordinated disclosure: please give us a reasonable amount of time
to investigate and release a fix before disclosing the issue publicly.
