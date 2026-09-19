# How the workshop works

> **Quick take:** a React interface talks to one authenticated Node API. Three validated configuration files define the trip. Revision-checked stores keep shared records, while a browser journal preserves unfinished saves.

## Product structure

`src/App.jsx` contains the tournament, course, logistics and expense interface. `src/Proposals.jsx` and `src/proposals.mjs` contain the five trip proposal models. `src/poll-core.mjs` validates and aggregates participant responses. `src/schema.mjs` binds records to the configured people, sessions, matches and courses.

`server/app.mjs` serves both API and compiled browser assets. Demo mode runs on loopback with explicit invented identities and an invented forecast. Production authenticates the HTML and assets as well as the API. Optional provider adapters are loaded only by the opted-in production paths.

`server/settings.mjs` loads the three validated configurations and calculates their binding hash. The browser build carries the same mode/hash; startup rejects a mismatch. Development rebuilds use that fixed binding too. Weekday, date and session-time display labels are derived from actual instants and the event timezone. The shared five-hour session interval also defines forecast coverage and must fit inside the event.

## Saves that can be explained

Every shared write carries an operation UUID, a base revision and a complete validated value. The store accepts a write only against its current revision. Retrying the same operation returns its original receipt even if a later edit has already arrived; reusing its UUID with a different payload is rejected.

Local storage uses a private binding and a locked JSON envelope with fsync/atomic rename. Redis uses an event hash and Lua operations that validate its binding and compare/update revisions atomically. Arrays are preserved as JSON rather than converted through Lua table encoding. Event records, each participant’s poll, photos and quotas have separate identities.

The browser writes an immutable in-flight request to its recovery journal before fetching. Later edits remain a separate draft until that request is acknowledged. A conflict preserves both copies for explicit review. Newer server observations take precedence over an older conflict response. A Web Lock gives one tab ownership of a particular identity’s event or poll journal; another tab cannot overwrite it. Current browsers on localhost or HTTPS are required.

The server checks the current actor, origin and permissions before replaying a receipt. It validates the full event and recomputes automatic results. The UI disables tournament mutations for participant links, while leaving score viewing, navigation, exports and that participant’s own poll available.

## Scoring and money

The course-handicap calculation is `index × slope / 113 + rating − par`. A negative index represents a plus handicap. Tee choices can be shared for a session or overridden per eligible player.

Two explicit competition modes are available. **Full-course** applies the configured allowance to each player’s course handicap. **Relative-match** subtracts the lowest unrounded course handicap in the match before applying the allowance and rounding. Stroke allocation handles values above 36 and plus handicaps giving strokes back. These are configurable competition rules; agree on the rule with your group and consult the governing [Rules of Handicapping](https://www.usga.org/handicapping/roh/2024-rules-of-handicapping.html) for official play.

Singles compare one net score on each side; better ball compares the lower net score from each pair. Results resolve as a last-hole win, an earlier clinch or a completed tie. Gaps before resolution prevent an automatic result. Manual overrides are explicit and survive recalculation until removed. Removing an override preserves the card; clearing a match’s result and scores is a separate backed-up action.

Statistics use actual entered holes. Nine arbitrary filled cells are not a completed front nine. Full rounds contain exactly eighteen valid scores. Player/session and course identities are stable IDs, independent of display names. The performance-probability panel uses an informal normal-distribution heuristic with a fixed spread of three; it is not an official handicap calculation or a validated assessment of a player.

Expense arithmetic converts validated dollar inputs to integer cents. Remainder cents are distributed deterministically in participant order. Balances sum to zero, including one-cent obligations. Settlement pairs debtors and creditors greedily; it does not claim the mathematically smallest possible number of transfers. No payment integration is performed.

## Five budgeting approaches

The proposals retain distinct scopes rather than hiding every trip behind the same formula. Inputs and visible breakdowns reconcile in cents; shared divisions use explicit rounding.

| Model | Included behavior |
| --- | --- |
| Hard and soft costs | Shared and personal categories, arrival route and optional practice; the hard-cost subtotal remains visible. |
| Shared retreat | A combined total with shared and personal costs, arrival and practice; no misleading hard-cost subtotal. |
| Hypothetical winner return | Optional prize return reduces the estimated net total while leaving hard costs unchanged. |
| Split cottages | Two houses, golf/cart/forecaddie/vehicle/contingency inputs, whole-dollar hard base, optional practice and comparison against the same arrival/practice choices. |
| Group package | Package rounds, premium round and optional replay, house share and explicitly included extras. Personal travel and unlisted categories are excluded. Unavailable lodging cannot be selected. |

The itinerary and displayed round count follow the selected package and replay. Scenario links contain only those calculator choices; they do not include access credentials or saved tournament state. Maps are schematic, and all shipped imagery and venues are invented.

## Verification

The Node suite covers scoring, partial rounds, signed handicaps, exact cents, strict configuration/state, proposal calculations, local and Redis contracts, authentication, provider transports, photo validation, recovery queues, Web Locks, private paths and setup. Browser scripts exercise the actual UI with invented records and block requests outside the local test origin.

The optional Redis integration test starts a disposable local Redis process and routes the actual Upstash client through a local REST bridge. It does not require or contact a real Upstash account. Set `REDIS_SERVER` and `REDIS_CLI` to installed local executable paths to run it. Normal tests skip that integration when the binaries are absent.

CI builds and tests supported Node versions, runs the extracted ZIP launchers, checks the browser interface and uses an actual Redis process. Live Gemini, hosted Redis and real NWS behavior are not covered by the offline test suite.
