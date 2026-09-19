# Source, examples and artwork

> **Quick take:** the reusable app and documentation are MIT licensed. The shipped people, trip details, records and illustrations were created as independent invented examples. No real trip dataset or photo collection is included.

The public engine preserves a personal golf-trip planner’s tournament, proposals, group poll, course guide, scorecard, contest and expense workflows. It separates owner settings and private records from the reusable product and adds validation, permission boundaries and recoverable shared saves.

The hero and two gallery illustrations were generated with ChatGPT image generation from original prompts, without reference photos. They depict no actual venue or group. [Artwork provenance](docs/gallery-artwork.json) records the generation prompts. The course-map SVG is an independently authored schematic diagram. These assets are included with the project license; generated pictures are illustrations, not documentary photographs or screenshots.

The browser bundles Cormorant Garamond, DM Sans and JetBrains Mono through Fontsource. Their original SIL Open Font License notices are preserved under `public/licenses/`. Those notices govern the fonts independently of the application’s MIT license.

React, Vite, Zod, proper-lockfile, the Upstash Redis client, Playwright and their dependencies retain their own authorship and licenses. Dependency versions are pinned in `package-lock.json`; npm installs their license notices with the packages. This source ZIP does not redistribute `node_modules`.

Optional provider data is supplied by the configured provider at runtime and is not part of the source examples. Owning this code does not grant access to anyone else’s data, provider account, photos or venue materials.
