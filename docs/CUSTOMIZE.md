# Make the workshop yours

> **Quick take:** keep the shipped example files unchanged. Make private copies of the three configuration files, finish their contents, validate them, then set up the real event. The Start files always open the invented demo.

## Keep a private layer

The public project is the reusable engine and its invented examples. Your trip belongs in ignored private files. Configuration includes participant names and venue details, so treat it as private even when it contains no password. A production browser build includes your configured trip and is served only after sign-in.

Create `.local/production` inside this folder. Copy these files there, using the filenames shown:

| Shipped example | Your private copy |
| --- | --- |
| `tournament.config.json` | `.local/production/tournament.json` |
| `poll.config.json` | `.local/production/poll.json` |
| `proposals.config.json` | `.local/production/proposals.json` |

You can create the folder and copy files in your file manager. On Mac, Command+Shift+Period reveals names beginning with a dot. On Windows, enable **View → Show → Hidden items** if needed. File Explorer may also hide filename extensions; ensure the files end in `.json`, not `.json.txt`.

Copy `.env.example` to `.env` in the project folder. Its production paths point to those three private copies. Set `GOLF_PUBLIC_ORIGIN` to your eventual HTTPS address. Environment variables already set in your terminal take precedence over `.env`.

## Configure the actual product

An assistant can help edit JSON, but it should preserve the schema and validate the result. Read `skills/golf-trip-workshop/SKILL.md` together with this guide. Never paste personal configuration into a public issue, commit or example.

**Tournament:** choose a new stable event ID, name, location, timezone and dates. The internal side keys remain `usa` and `europe` for compatibility, but the displayed team names and marks are yours. Give players stable IDs, names and current handicap indices. Both sides need equal roster sizes. A negative handicap value means a plus handicap.

Configure courses with eighteen holes, par and stroke indices, tee lengths, rating and slope, and the full strategy notes. Stroke indices must be a permutation from 1 through 18. Each session points to a configured course and eligible participants. Display weekday/date/time labels are derived from actual timestamps in the event timezone. Each five-hour session must fit inside the event dates. Singles have one player per side; better-ball matches have two. TBD matches start with empty player arrays and can be assigned in the app. Mixed singles/team sessions are supported.

Set `demo.fictional` to `false` for an actual trip, and replace its description. Set lodging, activities, food ideas, turf notes, contest amounts and your handicap rule. Course `directionsUrl`, `mapImage` and `mapAlt` are optional. Lodging accepts `directionsUrl`, `image` and `imageAlt`. Maps use confined local asset paths; directions can use HTTPS links. Leave missing facts absent rather than guessing them.

Put personal venue images and maps in `public/private/`. Production builds can include this directory behind sign-in; demo builds exclude it. Use only your own images or images you have permission to redistribute to your group. All other `public/` assets are eligible for demo builds. Never place credentials, JSON records or access links in any public/build directory. The included schematic area map is a planning diagram, not geographic navigation.

**Proposals:** adapt the five complete ideas and their cost models. All money inputs are integer cents. The file distinguishes shared costs, personal costs, arrival choices, practice rounds, hypothetical winner returns, cottage splits, and the package-only clubhouse model. Keep included/excluded categories explicit. Proposal IDs must match the poll’s base IDs.

**Poll:** edit the bases, driving choices, must-play choices, date choices and arrival choices. Option IDs are stable record keys. The app saves one response per participant and displays combined results; organizer access does not impersonate someone’s answer.

## Validate before anyone starts saving

From a terminal in the project folder, with `.env` pointing to the private configuration, run:

```sh
npm run build
```

The build validates the tournament, proposals and poll together. Fix any reported field error before continuing. Production output goes to ignored `dist-private/`. Demo output goes to ignored `dist/`. The server checks that its build and settings match before it starts.

After the configuration is ready, follow [hosting and access](HOSTING.md). `npm run setup` creates an empty real-event store and private access links. It does not copy invented scores or expenses into your real event.

## Changes after setup

Use the app for scores, handicap indices, per-player tees, TBD pairings, manual results, expenses, contest winners, house notes and announcements. These are normal shared records and remain editable by organizers and scorekeepers.

The three configuration files are bound to the saved store. Changing a roster, course, schedule, proposal or poll definition after people have begun saving requires a new event/workspace or a separately reviewed migration. There is no automatic migration command in this release. Do not bypass the binding or delete a saved folder to make a changed configuration load.

For another trip, keep the old folder and its backups, choose a new event ID and private data directory, and initialize a new event. The stable event ID also keeps browser recovery journals from different trips separate.

## Keep public improvements useful to you

Keep reusable fixes in the public engine. Keep personal settings, photos and outputs in the private layer. When updating the engine, back up the private layer, use a tagged release, validate your settings and test a copy of the saved event before switching your real group. A fresh source ZIP alone does not contain your private records.
