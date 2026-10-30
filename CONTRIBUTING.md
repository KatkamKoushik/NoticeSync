# Contributing to NoticeSync

Thank you for your interest in contributing to NoticeSync! We welcome contributions to improve academic intelligence, timeline synchronization, document parsing accuracy, and platform security.

---

## 1. Code of Conduct

All contributors and maintainers are expected to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please maintain a welcoming, respectful, and collaborative environment.

---

## 2. Development Setup

### Prerequisites
- **Node.js:** Version 22.x or higher (`node -v`)
- **Package Manager:** pnpm version 11.18.0 or higher (`npm install -g pnpm@11.18.0`)
- **PostgreSQL / Supabase:** A Supabase project with `pgvector` enabled for vector search, or use `NOTICE_SYNC_TEST_MODE=true` for offline deterministic testing without cloud dependencies.

### Installation
```bash
git clone https://github.com/KatkamKoushik/NoticeSync.git
cd NoticeSync
pnpm install --frozen-lockfile
```

### Local Environment
Copy the example environment file:
```bash
cp .env.example .env.local
```

For zero-cost offline local testing without external API keys, set:
```env
NOTICE_SYNC_TEST_MODE=true
```

To run the Next.js development server:
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 3. Contribution Workflow

1. **Create an Issue:** Before undertaking significant feature development or refactoring, open an issue to discuss the proposal with maintainers.
2. **Branch from `main`:** Use descriptive branch naming prefixes:
   - `feat/description` for new capabilities.
   - `fix/description` for bug and vulnerability fixes.
   - `docs/description` for documentation improvements.
   - `test/description` for evaluation and test suite enhancements.
3. **Commit Messages:** Follow the Conventional Commits specification:
   - `feat(scope): concise description`
   - `fix(scope): concise description`
   - `docs(scope): concise description`
   - `test(scope): concise description`
4. **Run Verification Before Submitting:**
   Ensure all automated verification checks pass cleanly:
   ```bash
   pnpm run check
   ```
   This executes:
   - `pnpm run lint`: ESLint code formatting and Next.js rule verification.
   - `pnpm run typecheck`: Strict TypeScript type compilation (`tsc --noEmit`).
   - `pnpm test`: Execution of all 104+ unit, integration, and security tests.

---

## 4. Engineering Standards

- **TypeScript Strictness:** Strict mode is enforced. Avoid unsafe type casting (`as unknown as ...` without guards) and avoid using `any`.
- **Security Boundaries:** Never trust client-supplied identifiers (`userId`, document paths). Always derive identity from the verified session in `getAuthenticatedUser()`.
- **Calendar Accuracy:** Never format dates with raw `toLocaleDateString()` on UTC midnight strings without timezone-safe parsing (`date-fns/parseISO`). All dates extracted from academic documents must be validated against the Gregorian calendar.
- **AI Schema Validation:** All model outputs must be validated using Zod schemas (`RawExtractionResponseSchema`). Never assume LLM output is valid JSON without defensive parsing and repair retry handling.
- **Preserve Documentation:** Update `README.md` or API documentation when modifying schemas, endpoints, or environment variable requirements.

---

## 5. Submitting a Pull Request

1. Push your branch to your fork or the repository.
2. Open a Pull Request targeting the `main` branch.
3. Provide a clear summary of changes, rationale, linked issues, and verification commands executed.
4. Ensure continuous integration checks pass in GitHub Actions.
