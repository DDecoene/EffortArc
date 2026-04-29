# Discovery Plan: HikeTracker Feature Prioritization

**Date**: 2026-04-19
**Product Stage**: Existing product, 0 external users (self-built)
**Discovery Question**: What features make HikeTracker genuinely useful for people training toward hiking events — and is there broader market demand?

---

## Core Value Proposition

> "Know where you actually stand, based on real data — not gut feel."

**Target user**: People preparing for hiking events (e.g. Dodentocht, other endurance walks) who don't know when to start training, where they stand, or whether they're on track.

---

## Ideas Selected for Validation

| # | Idea | Why it matters |
|---|------|---------------|
| 1 | Training Plan Generator | Tells users what to do next, not just where they are |
| 2 | "Am I Ready?" Dashboard Card | Single-verdict readiness reduces anxiety |
| 6 | Recovery & Overtraining Signals | Catches problems before they derail training |
| 7 | Long Walk Simulator | Projects event-day pace based on current data |
| 10 | Coach Mode (AI Suggestions) | Drives return visits, makes data actionable |

---

## Critical Assumptions

| # | Assumption | Idea | Impact | Uncertainty | Priority |
|---|-----------|------|--------|-------------|----------|
| C | Current readiness algorithm is accurate enough to trust | 2 | High | High | 🔴 Critical |
| A | Users follow a generated plan beyond week 1 | 1 | High | High | 🔴 Critical |
| D | Coach suggestions feel personal, not generic | 10 | High | High | 🔴 Critical |
| E | Hikers overtrain enough for recovery signals to fire meaningfully | 6 | High | High | 🟡 High |
| F | Pace decline reliably signals overtraining (not terrain/weather) | 6 | High | High | 🟡 High |
| G | Projected pace curve is motivating, not demoralizing | 7 | Medium | High | 🟡 High |
| H | Extrapolation generalizes credibly to 2-3x longest walk | 7 | High | High | 🟡 High |
| I | Coach mode drives return visits | 10 | High | Medium | 🟡 High |
| J | Strava data alone is enough for a meaningful training plan | 1 | Medium | Medium | 🟢 Medium |

---

## Validation Experiments

| # | Tests | Method | Success Criteria | Effort | Timeline |
|---|-------|--------|-----------------|--------|----------|
| 1 | C | Calibration check (self) | App verdict matches gut sense >70% over 4-6 walks | Zero build | 3-4 weeks |
| 2 | A | Concierge MVP in Facebook groups | 10+ engage, 3+ return for week 2 advice | 2 hours, no code | 1-2 weeks |
| 3 | D | Rule-based coach + journaled reactions | You change a session based on suggestion 2x in a month | 1-2 days build | 3-4 weeks |
| 4 | E+F | Data audit + forum lurking | Clear pattern: overtraining OR undertraining dominates | 2 hours, no code | 1 week |
| 5 | G+H | Screenshot test in hiking group | People ask for access, not "how did you calculate that?" | 2-3 days build + 1 post | 2 weeks |

---

## Experiment Details

### Experiment 1: Calibration Check (tests assumption C)
**Hypothesis**: The readiness algorithm produces verdicts that match a trained hiker's felt sense of preparedness.
**Setup**: Before each long walk, log your gut readiness (1-10). After syncing, compare to app verdict.
**Measurement**: % of walks where app verdict (ready/on track/at risk) matches gut score direction.
**Decision**: If <70% match → fix the algorithm before building anything on top of it.

### Experiment 2: Concierge MVP (tests assumption A)
**Hypothesis**: People in hiking event groups want a weekly training target based on their data, and will return for follow-up.
**Setup**: Post in Dodentocht / hiking event Facebook groups: *"Building a tool that tells you if you're on track for your event and gives you a weekly training target. Drop your goal event and I'll manually tell you what your week should look like."* Respond manually using HikeTracker's readiness logic.
**Measurement**: Response count, return rate (did they come back week 2?).
**Decision**: <10 responses → wrong audience or message. Responses but no returns → plan format isn't compelling.

### Experiment 3: Rule-Based Coach (tests assumption D)
**Hypothesis**: 5-6 specific data-driven rules produce suggestions that feel personal enough to act on.
**Setup**: Implement rules like:
- Pace held within 5% across segments → "your endurance held well today"
- Last-quarter pace dropped >15% → "you hit a wall in the final stretch — consider shorter intervals next week"
- Elevation gain up 20%+ vs. last walk → "good hill work — your legs are adapting"

After each walk, journal: obvious / surprising / useful / wrong.
**Measurement**: Did you change a subsequent session based on the suggestion?
**Decision**: If suggestions feel generic even to you → they'll feel worthless to strangers. Rethink the rule set or add more data inputs.

### Experiment 4: Forum Lurking + Data Audit (tests E+F)
**Hypothesis**: Overtraining (not undertraining) is a real problem for hiking event participants.
**Setup**: (1) Review own Strava history for pace decline patterns — correlate with known hard days vs. fatigue. (2) Read 50+ posts in Dodentocht group for injury/burnout vs. underprepared mentions.
**Measurement**: Ratio of overtraining signals to undertraining signals in community posts.
**Decision**: If undertraining dominates → focus on volume targets, not recovery signals. If mixed → build both.

### Experiment 5: Screenshot Test (tests G+H)
**Hypothesis**: A projected pace chart for event distance reads as credible and useful, not made-up.
**Setup**: Build the long walk simulator. Take a screenshot. Post in hiking group: *"Made this tool that projects how your pace would hold up across a 100km walk based on your training data. Does this look useful or does it feel made up?"*
**Measurement**: Do people ask how to get access? Or do they question the methodology?
**Decision**: Methodology questions → improve the model or add explanation. Access requests → build the full feature.

---

## Discovery Timeline

| Week | Focus |
|------|-------|
| 1 | Experiment 4 (forum lurking, 2h). Start Experiment 1 (calibration, ongoing). |
| 2 | Experiment 2 (concierge MVP post). Experiment 3 build starts. |
| 3 | Experiment 3 live (coach suggestions on own walks). Experiment 5 build. |
| 4 | Experiment 5 screenshot test post. Experiment 2 follow-up (did people return?). |
| 5 | Synthesize all results. Decide what to build first. |

---

## Decision Framework

- Experiment 1 fails (<70% match) → fix readiness algorithm before any new features
- Experiment 2 gets 10+ responses + returns → Training Plan Generator is the priority build
- Experiment 2 gets responses but no returns → Rethink plan format; Coach Mode may be more important
- Experiment 3 suggestions feel generic → Rule-based coach isn't enough; revisit with more data inputs or LLM
- Experiment 4 shows undertraining dominates → Deprioritize recovery signals; focus on volume/progression
- Experiment 5 gets access requests → Build Long Walk Simulator as a shareable feature

---

## Open Questions

- Is there a non-Strava user segment worth serving? (manual entry)
- Should event-specific profiles (Dodentocht presets) be a growth mechanic or a core feature?
- Is the right distribution channel Facebook groups, or something else?
