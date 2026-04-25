# Security Policy & Known Vulnerabilities

This document tracks known security vulnerabilities in Later-Life Planner dependencies and explains why they are not exploitable in our specific context.

## Summary

Later-Life Planner uses security-conscious practices including:
- Regular dependency updates
- Automated security scanning (Semgrep, gitleaks, and CodeQL) in CI/CD
- Browser-side encryption for sensitive financial data
- Read-only API access to Azure resources
- No file upload functionality in production

However, some upstream packages contain vulnerabilities that we cannot fully remediate without introducing instability or breaking changes. These are documented below.

## Known Vulnerabilities (as of April 2026)

`npm audit` reports **11 vulnerabilities** (10 moderate, 1 high) across 4 root packages. npm counts each affected package in the transitive dependency chain separately, so the 11 count includes packages such as vite, vite-node, next, and @clerk/nextjs that indirectly depend on a vulnerable root. The 4 root packages and their CVEs are documented below.

### 1. **postcss** (Moderate) - XSS via Unescaped `</style>`
- **CVE**: GHSA-qx2v-qp2m-jg93
- **Status**: Upstream blocker
- **Reason**: Next.js 15.5.15 internally pins postcss to 8.4.x range
- **Impact**: Only if untrusted CSS is parsed by PostCSS
- **Mitigation**: 
  - All CSS in LLP is trusted (static files)
  - No user-supplied CSS processing
  - Waiting for Next.js/eslint-config-next upstream updates
- **Action**: Monitor Next.js releases; will update when safe

### 2. **uuid** (Moderate) - Buffer Bounds Check Missing
- **CVE**: GHSA-w5hq-g745-h8pq
- **Status**: Blocked by @azure/msal-node dependency
- **Reason**: uuid ^8.3.0 is required by @azure/msal-node; forcing an upgrade would downgrade @azure/identity to 1.1.0, introducing far greater risk
- **Impact**: Only if uuid is called with specific buffer parameters
- **Mitigation**: 
  - UUID usage is within Azure authentication (trusted context)
  - Non-adversarial parameter patterns in normal use
- **Action**: Accept current Azure SDK version; monitoring for stable upgrade path

### 3. **esbuild** (Moderate) - HTTP Request Smuggling
- **CVE**: GHSA-67mh-4wv8-2f99
- **Status**: Part of vitest dev dependency
- **Reason**: vitest 1.x uses vulnerable esbuild (<=0.24.2); upgrade to vitest 4.x requires testing and is a breaking change
- **Impact**: Only in development environment; affects dev server connection handling
- **Mitigation**:
  - Dev server not exposed to production traffic
  - Not in production build output
- **Action**: Test and upgrade vitest to 4.1.5 in upcoming release

### 4. **xlsx** (High) - Prototype Pollution + ReDoS
- **CVE**: GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9
- **Status**: No patch available from sheetjs maintainers
- **Reason**: Vulnerabilities in XLSX parsing; no upstream fix released
- **Usage**: devDependency only — used in local development utility scripts:
  - `scripts/generate-tax-comparison.ts` — generate tax optimization examples
  - `scripts/update-tax-comparison-from-template.ts` — update existing comparisons
- **Impact**: Only exploitable if untrusted .xlsx files are parsed by these local scripts
- **Mitigation**:
  - Scripts are development-only, not in production code or build output
  - Not bundled into Next.js application
  - No user file upload in production
  - All input to scripts is internally generated test data
- **Action**: 
  - Monitor sheetjs releases for patches
  - Consider alternative library (papaparse, csv-parse) if needed
  - Accept as risk for local development utilities

## Deployment Context

**Production deployment** uses Docker with:
- No file upload capability
- Encrypted Cosmos DB backend
- Read-only Azure authentication
- Fixed dependencies built at image time
- No dynamic code execution

These factors further reduce exploitability of known vulnerabilities.

## Security Monitoring

- Semgrep, gitleaks, and CodeQL run on every CI/CD build (see `.github/workflows/security-scans.yml` and `.github/workflows/codeql.yml`)
- Dependabot monitors for new vulnerabilities
- Quarterly security review of transitive dependencies
- Upstream package monitoring (Next.js, @clerk, @azure)

## Reporting Security Issues

If you discover a security vulnerability in Later-Life Planner:
1. DO NOT open a public GitHub issue
2. Use GitHub's private security advisory reporting flow for this repository ("Security" tab → "Report a vulnerability")
3. Provide detailed reproduction steps and impact assessment

## Future Actions

### Next Maintenance Release
- [ ] Test and upgrade vitest to 4.1.5 (resolves esbuild vulnerability)
- [ ] Evaluate sheetjs alternatives if needed
- [ ] Monitor Next.js 15.6+ for postcss resolution

### When Available
- [ ] Upgrade @azure/msal-node when a version compatible with uuid >=14 is available
- [ ] Re-evaluate all transitive dependencies
- [ ] Consider ESLint v10 upgrade (plugin ecosystem dependent)

## Last Updated
April 25, 2026 - Post dependency remediation PR #290
Updated April 26, 2026 - Resolved undici vulnerabilities via @azure/msal-node upgrade; corrected CI/CD security scan references, uuid dependency chain, vitest version, and reporting channel
