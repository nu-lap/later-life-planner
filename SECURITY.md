# Security Policy & Known Vulnerabilities

This document tracks known security vulnerabilities in Later-Life Planner dependencies and explains why they are not exploitable in our specific context.

## Summary

Later-Life Planner uses security-conscious practices including:
- Regular dependency updates
- Automated `npm audit` checks in CI/CD
- Browser-side encryption for sensitive financial data
- Read-only API access to Azure resources
- No file upload functionality in production

However, some upstream packages contain vulnerabilities that we cannot fully remediate without introducing instability or breaking changes. These are documented below.

## Known Vulnerabilities (as of April 2026)

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
- **Status**: Blocked by @azure/identity dependency
- **Reason**: Upgrading uuid breaks @azure/identity < 4.x which have even more vulns
- **Impact**: Only if uuid is called with specific buffer parameters
- **Mitigation**: 
  - UUID usage is within Azure authentication (trusted context)
  - Non-adversarial parameter patterns in normal use
- **Action**: Accept current Azure SDK version; monitoring for stable upgrade path

### 3. **esbuild** (Moderate) - HTTP Request Smuggling
- **CVE**: GHSA-67mh-4wv8-2f99
- **Status**: Part of vitest dev dependency
- **Reason**: vitest 2.x uses vulnerable esbuild; upgrade to 4.x requires testing
- **Impact**: Only in development environment; affects dev server connection handling
- **Mitigation**:
  - Dev server not exposed to production traffic
  - Not in production build output
- **Action**: Test and upgrade vitest to 4.1.5 in upcoming release

### 4. **undici** (High) - WebSocket & HTTP Parsing Issues
- **CVE**: GHSA-f269-vfmq-vjvj, GHSA-2mjp-6q6p-2qxm, GHSA-vrm6-8vpv-qv8q, GHSA-v9p9-hfj2-hcw8, GHSA-4992-7rv2-5pvq, GHSA-phc3-fgpg-7m6h
- **Status**: Available fix via `npm audit fix`
- **Reason**: Transitive via jsdom devDependency (test framework)
- **Usage**: jsdom provides DOM simulation for vitest tests
- **Impact**: WebSocket/HTTP parsing issues in Node.js client; only in development environment
- **Mitigation**:
  - Not in production code or build output
  - Development-only test dependency
  - Vulnerabilities only manifest during test execution
- **Action**: 
  - Upgrade available; will apply in next maintenance release
  - Monitor undici releases for stable patches

### 5. **xlsx** (High) - Prototype Pollution + ReDoS
- **CVE**: GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9
- **Status**: No patch available from sheetjs maintainers
- **Reason**: Vulnerabilities in XLSX parsing; no upstream fix released
- **Usage**: Only in `scripts/generate-tax-comparison.ts` (development utility)
- **Impact**: Only exploitable if untrusted .xlsx files are parsed
- **Mitigation**:
  - Script is development-only, not runtime
  - No user file upload in production
  - All input to the script is internally generated
- **Action**: 
  - Monitor sheetjs releases
  - Consider alternative library (papaparse, csv-parse) if functionality needed in production
  - Document as accepted risk for dev utilities

## Deployment Context

**Production deployment** uses Docker with:
- No file upload capability
- Encrypted Cosmos DB backend
- Read-only Azure authentication
- Fixed dependencies built at image time
- No dynamic code execution

These factors further reduce exploitability of known vulnerabilities.

## Security Monitoring

- `npm audit` runs on every CI/CD build
- Dependabot monitors for new vulnerabilities
- Quarterly security review of transitive dependencies
- Upstream package monitoring (Next.js, @clerk, @azure)

## Reporting Security Issues

If you discover a security vulnerability in Later-Life Planner:
1. DO NOT open a public GitHub issue
2. Email security concerns to the development team
3. Provide detailed reproduction steps and impact assessment

## Future Actions

### Next Maintenance Release
- [ ] Upgrade undici via `npm audit fix` (high-severity dev dependency)
- [ ] Test and upgrade vitest to 4.1.5 (esbuild fix)
- [ ] Evaluate sheetjs alternatives if needed
- [ ] Monitor Next.js 15.6+ for postcss resolution

### When Available
- [ ] Upgrade @azure/identity when stable 4.x path available
- [ ] Re-evaluate all transitive dependencies
- [ ] Consider ESLint v10 upgrade (plugin ecosystem dependent)

## Last Updated
April 25, 2026 - Post dependency remediation PR #290
Updated April 26, 2026 - Added missing undici vulnerability documentation
