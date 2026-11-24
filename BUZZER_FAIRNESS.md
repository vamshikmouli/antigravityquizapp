# Fair Buzzer

Goal: the fastest **finger** wins, not the fastest phone or network, and
cheating gains (almost) nothing.

## Round flow

```
question-started ─(readingTime)─► buzzer-armed ─(random 0.6–2.5 s)─► buzzer-activated ─► collect ─► buzzer-winner
                                   "GET READY"                          (OPEN)            window
                                   tap = false start
```

- **Armed**: the phone paints a grey buzzer. Tapping it is a **false start**:
  that player is locked out for this question. The random hold stops anyone
  counting down to the open.
- **Open**: the server sends OPEN to each phone **with an ack**. The phone
  commits the red buzzer synchronously, stamps `performance.now()` in the
  frame it is painted, and acks. The press is taken on `pointerdown` (finger
  contact), and the event's high-resolution timestamp gives
  `reactionMs = tap − shown`.
- **Collect**: after the first valid press, the server waits
  `clamp(slowest player's p90 RTT + 50, 150, 600)` ms, or less if every
  connected player has already pressed or false-started. Then the lowest
  *effective* time wins. Times within 10 ms count as a tie, which the earlier
  arrival wins.

## Why a phone can't lie its way to a win

For each player the server knows `sentAt` (OPEN sent), `ackAt` (painted + acked)
and `arrivedAt` (press received), plus a rolling RTT from server-initiated pings
every 2 s. The server starts each ping, so a phone can delay a reply but never
speed it up.

```
observed  = arrivedAt − sentAt                 down + render + reaction + up
credit    = ackAt − sentAt, capped at ping p90 + 150 ms and 800 ms
floor     = observed − credit                  ≈ the real reaction
effective = max(claimed reactionMs, floor)
```

| Cheat | What happens |
|---|---|
| Forged tiny `reactionMs` | Raised to `floor`, and flagged `CLAMPED` |
| Delaying acks to earn latency credit | Capped at ping p90 + 150 ms, and flagged `LAG_SPIKE` |
| Tapping before the open | `FALSE_START`, locked out for this question |
| Auto-tapper | Under 100 ms is rejected (`TOO_FAST`). Consistently fast and uniform play is flagged `BOT_PATTERN` |
| Replaying an old press | Needs the current `roundId`. One press per player per round |
| Pretending to be someone else | Identity comes from the socket, not from the message |

**Honest limits:**
- A cheater can still gain the gap between their real render+jitter and the
  150 ms allowance. In practice that is tens of milliseconds.
- A bot tapping at a human-like 140 ms can't be proven to be a bot. It gets
  flagged, and the host decides.
- Rendering slower than the allowance costs an honest player only the excess.
  The buzzer is painted during "get ready", so opening it takes one frame even
  on low-end phones.

## Host tools (TV)

- The winner banner shows the reaction time and the winning margin, e.g.
  "234 ms · by 23 ms".
- **Buzz details** (host only) shows each presser's judged time and flags, with
  an **Award** button to re-award the buzz. Award is available only until the
  winner has answered. Win counters and the audit log update to match.
- When the winner has a serious flag (`CLAMPED`, `BOT_PATTERN`), the panel reads
  "⚠️ Check this buzz".

## Data

- **Judging happens in server memory** (`BuzzerManager`). Node processes one
  event at a time, so it is race-free on one instance with no locks and no
  database on the hot path.
- **Audit**: Postgres table `BuzzerPress` records every attempt (claimed,
  observed, RTT, credit, effective, flags, and outcome WON/LOST/LATE/REJECTED/OVERRIDDEN).
  It is written after the winner is announced, through an in-order queue per
  session.
- `GET /api/sessions/:sessionId/buzzer-presses[?questionId=]` returns the audit
  log. Session owner only.
- Running several server instances later: pin each quiz session to one
  instance (sticky sessions plus the Socket.IO Redis adapter). Judging stays
  in memory on that instance.

## Tuning

All thresholds are in `FAIRNESS` in `controllers/fairBuzzer.js`. Tune them
from real `BuzzerPress` data.

## Tests

- `test/fair-buzzer.test.js`: judging math and round state (21 cases).
- `test/fair-buzzer-live.test.js`: real server, three simulated phones with
  artificial latency. A 400 ms-RTT phone with a faster finger beats a 20 ms one;
  a forged time is clamped; a false start is locked out; host override works;
  the audit rows are written; the endpoint is owner-only. Skips when no
  database is available.
