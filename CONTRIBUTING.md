# Improve the workshop

> **Quick take:** useful fixes and adaptations are welcome. Start with the invented demo, keep the change focused, and include a reproduction or meaningful test for changed behavior.

Install Node.js 22.12 or newer, then run `npm ci --include=dev --include=optional` and `npm run dev`. The app rebuilds when source/public assets change; refresh your browser. Restart after changing server code or configuration. Run `npm test` and `npm run build` before submitting a change.

Good contributions include clearer first-time setup, better keyboard/accessibility behavior, useful course-planning tools, additional well-defined proposal models, and tests for real calculation or save-recovery edge cases. Explain the user-facing problem and what your change does.

Use entirely invented names, images, scores and costs in examples and tests. Never include `.env`, access links, personal configurations, copied scorecards, saved databases, browser journals or real group responses. A renamed real fixture is still a real fixture. Preserve third-party notices when adding dependencies or assets.

Keep demo mode offline after installation. Optional provider calls need explicit production configuration, bounded requests and a synthetic transport test. Shared writes must preserve actor authorization, revision checks, idempotent retries and recoverable local drafts. Do not bypass a store binding to make a test pass.

Structural configuration migration is an intentional open area. A contribution needs a clear backup/restore design, validation of every record type, preservation of photo/poll data, browser-journal handling, and an explicit recovery path for interrupted writes.

Source releases use the explicit `release-files.json` allowlist. Add a reviewed new file there when it belongs in the ZIP; do not copy the whole working directory. Contributions are made under the project’s MIT license. Report security issues [privately](SECURITY.md).
