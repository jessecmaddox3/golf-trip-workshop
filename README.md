![Golf Trip Workshop. Plan the trip. Play the matches. Pick a place, keep score, settle up.](docs/assets/hero.png)

# Golf Trip Workshop

A golf weekend has a surprising number of moving parts. This brings the trip ideas, group preferences, matches, scorecards, course notes and shared expenses into one place.

I built this for my own personal use. Make it your own, and feel free to improve mine. Hopefully it gives you a useful starting point, or at least some ideas. Cheers!

> **Start here:** download the app, install Node.js once, then open the Start file. The complete local demo uses invented people, courses, places and costs. You do not need a GitHub account, an AI subscription or a hosting account to try it.

**[Download the app](https://github.com/jessecmaddox3/golf-trip-workshop/releases/latest/download/golf-trip-workshop.zip)** · **[First-time setup](docs/START-HERE.md)** · **[Make it yours](docs/CUSTOMIZE.md)**

## Open it in five steps

1. Install the **LTS** version of [Node.js](https://nodejs.org/en/download). Accept the normal installer options. Node is the small program that runs this app on your computer.
2. Download the ZIP using the link above. A ZIP is a compressed folder.
3. Extract the whole ZIP: on Windows, right-click it and choose **Extract All**; on Mac, double-click it. Keep the files together.
4. Open the extracted `golf-trip-workshop` folder. On **Windows**, double-click `Start.cmd`. On **Mac**, open `Start.command`. On **Linux**, run `sh start.sh` in that folder. [If your computer blocks the Start file, follow these steps.](docs/START-HERE.md#when-double-click-does-not-work)
5. Leave the terminal window open. After the first installation, your browser opens the app. Choose **Open as organizer** and explore. Close the terminal with **Ctrl+C** when finished.

The first start downloads dependencies from npm, so it needs internet access. Once installed, the invented demo runs locally, stores its records on your computer and makes no provider requests. Later starts reuse the installation. Changes survive closing and reopening the app.

## What you get

This is the working tool, including the details that made it useful to me. The example content has been rebuilt from scratch so you can explore it safely.

| Part | What it does |
| --- | --- |
| Plan the trip | Five complete proposal examples with different cost models, editable scenarios, itinerary, courses, lodging, galleries, schematic maps and printable summaries. |
| Ask the group | Individual poll responses for destinations, driving, must-play courses, dates, arrival and suggestions, plus group results. |
| Run the competition | Singles and better-ball matches, configurable teams and players, pairings, hole-by-hole scoring, per-player tees, handicap calculations, automatic results and explicit manual overrides. |
| Keep the useful details | Course strategy and eighteen-hole guides, tee matrices, activities, food ideas, lodging notes, announcements and a trip guide. |
| Track the extras | Team prize, MVP, closest-to-pin records, net-birdie prizes, statistics, shared expenses and settlement amounts in exact cents. |
| Keep control of the records | Local backups, CSV export, scorecard-photo download, recoverable pending saves and explicit conflict resolution. A hosted event uses individual access links and separate permissions. |

Scorecards can be entered manually or photographed and reviewed. Optional Gemini reading and US National Weather Service forecasts are off by default. Nothing pays a bill, collects a prize pool, makes a reservation or messages your group.

## Make it your own

Try the demo first. A real event uses private configuration, private storage and an authenticated Node server behind HTTPS. It is more involved than opening the demo; the [customization guide](docs/CUSTOMIZE.md) and [hosting guide](docs/HOSTING.md) explain each part.

If you work with an AI coding assistant, open this folder and ask it:

> Read `skills/golf-trip-workshop/SKILL.md`. Help me explore the invented demo, then make private configuration for my own trip. Keep my people, access links, photos and records out of the public source. Explain the choices and validate the result before hosting anything.

You can use all of the app or borrow one part. The [MIT license](LICENSE) permits modification, redistribution and commercial use, with its short copyright and license notice retained.

## For people who already use a terminal

Node.js 22.12 or newer is required. The current LTS release is a good choice.

```sh
npm ci --include=dev --include=optional
npm run build
npm run demo
```

Open `http://127.0.0.1:5088`. `npm run dev` rebuilds the app when source or public assets change; refresh the browser after a rebuild. Restart after changing configuration or server code. Development uses the same confined web server as the built app.

```sh
npm test
npm run build
```

See [architecture and calculations](docs/ARCHITECTURE.md), [contributing](CONTRIBUTING.md), [privacy and security](SECURITY.md), and [source and artwork notes](NOTICE.md).

## A few practical limits

- This is a personal-use project, not a managed service. You run it and keep its backups.
- The two sides have equal roster sizes. Match formats are singles and two-person better ball, with eighteen-hole course data.
- Finalize the event configuration before collecting real records. Structural configuration changes require a new event/workspace or a separately reviewed migration. In-app scores, handicaps, pairings, notes and expenses remain editable.
- Pending-save recovery needs a current browser with Web Locks, on localhost or HTTPS. One editable tab per identity keeps that identity’s recovery journal consistent.
- The optional AI reader can make mistakes. Review every player, score and notation before saving. Live provider availability and model behavior are outside the offline tests.
- The performance estimates are informal heuristics. The app does not issue an official handicap or connect to GHIN. [Calculation details](docs/ARCHITECTURE.md#scoring-and-money) explain the house rules and assumptions.

Built with AI assistance, including independent review and synthetic regression tests. Runtime AI is optional. Improvements, bug reports and useful adaptations are welcome.
