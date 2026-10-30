# NoticeSync — Dependency Upgrades & Modernization Report

**Target Repository:** [NoticeSync](https://github.com/KatkamKoushik/NoticeSync)  
**Audit Branch:** `audit/repository-review-and-roadmap`  
**Date:** October 31, 2026  

---

## 1. Dependency Security Audit Results (`pnpm audit:deps`)

Running `pnpm audit:deps` (`pnpm audit --prod`) identified **17 security vulnerabilities**:
- **3 Critical Severity**
- **6 High Severity**
- **6 Moderate Severity**
- **2 Low Severity**

### Vulnerability Breakdown:

| Severity | Package | Vulnerable Range | Patched In | Issue / Advisory | Path |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Critical** | `next` | `>=16.0.0 <=16.4.0` | `>=16.4.1` | Unauthenticated RCE in Image Optimization API when SVG files are used | `next`, `@sentry/nextjs > next` |
| **Critical** | `@sentry/nextjs` | `>=10.0.0-alpha.0 <10.75.2` | `>=10.75.2` | Sentry-Javascript: Middleware Bypass when using Tunnel route ([GHSA-mchm-gjx6-7h55](https://github.com/advisories/GHSA-mchm-gjx6-7h55)) | `@sentry/nextjs` |
| **High** | `fast-uri` | `<3.0.0` or `>=3.0.0 <3.1.9` | `>=3.1.9` | Scheme injection & parsing vulnerability ([GHSA-xhq7-xmqj-769h](https://github.com/advisories/GHSA-xhq7-xmqj-769h)) | Transitive via `@sentry/nextjs > webpack-plugin > ajv` |
| **Moderate** | Various transitive | Multi | Updated packages | ReDoS and prototype pollution in auxiliary bundler plugins | Deep dependencies of Sentry webpack plugin |

---

## 2. Package Inventory & Upgrade Matrix

| Package Name | Current Version | Recommended Version | Upgrade Type | Risk & Migration Effort | Notes |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **`next`** | `^16.4.0` | `^16.4.1` (or latest) | **Security / Urgent** | Low; patch update resolving Image Optimization RCE. | Unblocks production build (`next build`). |
| **`@sentry/nextjs`** | `^10.70.0` | `^10.75.2` | **Security / Urgent** | Low; fixes Tunnel route middleware bypass. | Maintains existing error tracking configuration. |
| **`react` & `react-dom`** | `19.2.8` | `19.2.8` (or current) | Maintenance | None; already aligned with Next.js 16 requirements. | React 19 stable canary channel. |
| **`@ai-sdk/google`** | `^4.0.50` | `^4.0.50` | Maintenance | Low; verify Vercel AI SDK compatibility. | Used for Google Generative AI streaming. |
| **`@ai-sdk/groq`** | `^4.0.30` | `^4.0.30` | Maintenance | Low; check for latest model names. | Used for Groq streaming inference. |
| **`ai`** | `^7.0.77` | `^7.0.77` | Maintenance | Low; current major release. | Core Vercel AI SDK text streaming. |
| **`@supabase/supabase-js`** | `^2.112.3` | `^2.112.3` | Maintenance | Low; stable client SDK. | Fully compatible with PostgreSQL and pgvector. |
| **`date-fns`** | `^4.4.0` | `^4.4.0` | Stable | None; modern immutable date library. | Used for ISO calendar validation. |
| **`ics`** | `^3.12.0` | `^3.12.0` | Stable | None; standard iCalendar generation. | Excludes unconfirmed events. |
| **`tesseract.js`** | `^7.0.0` | `^7.0.0` | Stable | None; headless OCR engine. | Bounded by 25s execution timeout. |
| **`pdf-parse`** | `^2.4.5` | `^2.4.5` | Stable | None; head-to-head PDF text extractor. | Bundled in `serverExternalPackages`. |
| **`uuid`** | `^14.0.2` | `^11.0.0` | Cleanup | Low; align version with `@types/uuid: ^11.0.0`. | Current official major release is v11. |
| **`zod`** | `^4.6.5` | `^4.6.5` | Stable | None; runtime schema validation. | Used for extraction schema parsing. |
| **`tailwindcss`** | `^4` | `^4.3.3` | Modern | None; uses modern `@tailwindcss/postcss`. | Modern CSS theme variable mapping. |

---

## 3. Next.js 16 Architectural Conventions & Compliance

Based on the installed Next.js 16 documentation in `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`, the following rules apply:

1. **Turbopack Stable by Default:**  
   Next.js 16 uses Turbopack for both `next dev` and `next build` without requiring the `--turbopack` flag. `package.json` scripts (`"dev": "next dev"`, `"build": "next build"`) are already correctly configured.
2. **`serverExternalPackages` Top-Level Configuration:**  
   In Next.js 16, `serverExternalPackages` is stabilized at the top level of `next.config.ts`. NoticeSync correctly defines:
   ```ts
   const nextConfig: NextConfig = {
     serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
   };
   ```
3. **Async Request APIs:**  
   In Next.js 16, synchronous access to `params`, `searchParams`, `cookies()`, and `headers()` is completely removed. NoticeSync route handlers already use `req.json()` and `new URL(req.url)` asynchronously.
4. **Proxy Convention vs Middleware:**  
   Next.js 16 encourages migrating edge middlewares to the modern `proxy` convention where applicable. NoticeSync currently does not define custom edge middleware files.

---

## 4. Recommended Step-by-Step Modernization Plan

### Step 1: Execute Security Upgrades
Update `package.json`:
```json
{
  "dependencies": {
    "next": "^16.4.1",
    "@sentry/nextjs": "^10.75.2"
  }
}
```
Run installation:
```bash
pnpm install
```

### Step 2: Validate Security Audit
Run production dependency audit to confirm critical and high vulnerabilities are resolved:
```bash
pnpm audit:deps
```

### Step 3: Run Full Validation Pipeline
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

### Rollback Strategy:
If unexpected compilation or runtime regressions occur during dependency patching, revert `package.json` and restore `pnpm-lock.yaml` via git:
```bash
git checkout package.json pnpm-lock.yaml
pnpm install --frozen-lockfile
```
