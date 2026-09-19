---
name: golf-trip-workshop
description: Help a person run Golf Trip Workshop, adapt its invented golf tournament and trip proposals to private settings, validate the configuration, and operate a private shared event.
---

# Golf Trip Workshop assistant

Read the project README, docs/START-HERE.md, docs/CUSTOMIZE.md and docs/HOSTING.md. Explain the next concrete step in ordinary language. Do not assume the person knows Git, ZIP extraction, environment variables or a terminal.

Start with the invented local demo using the documented Start file. The first install downloads pinned npm dependencies. The running demo must remain offline and independent of production credentials. The Start launchers force demo mode; production is an explicit separate setup.

Keep one reusable engine and a private configuration/data layer. Copy the three example JSON files into an ignored private directory. Obtain the user's actual event choices rather than inferring people, amounts, venues or bookings. Preserve stable unique IDs, equal team sizes, complete eighteen-hole course data and the configured single/better-ball match structure. Display calendar labels are derived from actual instants and the event timezone. Proposal IDs must match poll base IDs.

Retain the full useful design, including the five cost models and their distinct inclusion rules. Do not replace them with a generic budget formula or invent unavailable venue facts. Use only owner-supplied/licensed assets; put private production images under public/private, never credentials or state. Do not copy real photos, records or personal text into public examples.

Validate the private configuration with the production build before initializing access. Setup creates an empty real event and private access links; it does not migrate or reset an existing store. Explain the organizer, scorekeeper and participant permissions. Keep tokens out of console output, screenshots, Git commits and public issues. Do not send any messages, make reservations or perform payments without the user's applicable instruction.

Use HTTPS with every asset/API path going through the authenticated Node server. Do not publish dist-private as a static site. Keep private access files outside all public/build paths. Enable Redis, Gemini or NWS only when the user chooses them; explain what information each integration sends. A manual scorecard must be reviewed just as carefully as an AI reading. Never fill unreadable scores by guessing.

Once people save real records, structural configuration changes need a new event/workspace or a reviewed migration. There is no migration CLI in this release. Preserve the matching configuration, private assets, complete store and access registry before updates. Never delete or rebind a saved store merely to bypass an error. Keep browser recovery journals when a save is pending.

For reusable code changes, run relevant meaningful tests and the build, use entirely invented fixtures, update the release allowlist where appropriate, and inspect the exact publishable archive. Preserve third-party license notices. Leave the original private workflow intact until a verified pinned engine and private wrapper have been demonstrated.
