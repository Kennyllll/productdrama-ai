# ProductDrama AI — Instructions for coding agents

Read `PROJECT_BRIEF.md` and the assigned `tasks/*.md` before coding.

1. **Working mode**: local-first. Use Devin Local in the open project folder. Do not use Devin Cloud, upload repository content, deploy, create cloud accounts, or connect external integrations without explicit user approval.
2. **Tech baseline**: Next.js App Router + TypeScript + Tailwind CSS; npm; ESLint; local Git. Start with mocked content. Introduce SQLite only when persistence is explicitly scheduled.
3. **Scope**: Implement **only** the currently assigned task. Show a short implementation plan before making major changes. Don't substitute an entire generated website for the product-specific workflow.
4. **Secrets**: Never hard-code or echo API keys. Keep `.env.local`, local images, generated videos, databases, and user files out of Git. Restrict uploads to supported content types and safe limits when implemented. Do not place private user uploads directly under a publicly served assets directory without a conscious access plan.
5. **Code quality**: Modular components, typed domain entities, concise comments, reusable navigation/layout, responsive design, accessibility, sensible error/empty/loading states. Avoid unnecessary dependencies.
6. **Testing**: Run `npm run lint` and `npm run build` (and any tests that exist) for every task; report actual command results, not just 'tested'. Start local dev server for UI tasks.
7. **Git discipline**: Before work, check `git status`. Record working files and only commit after user approval. Never overwrite user changes, reset branches, delete files outside scope, or force push.
8. **Honest demo**: Clearly distinguish mock buttons, sample story data and demo imagery from functioning AI/API features. Avoid fake success notices.
9. **Handoff**: At task end report: changed files, routes, commands run and outcomes, preview URL, known limitations, and next recommended task. Attach screenshots if possible.
10. **Review**: For destructive operations, dependency upgrades with migration impact, paid API calls, credentials access, or network publishing: stop and request permission.
