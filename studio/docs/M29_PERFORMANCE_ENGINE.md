# M29 — Performance Engine

The quality tier is **measured**, not assumed.

The tier chosen at startup is a guess from a renderer string. It is a decent guess and it is
routinely wrong: a mid-range phone throttles after ninety seconds, a laptop switches to its
integrated GPU on battery, a tab sharing a machine with a video call gets a fraction of the
frames it did a minute ago. None of that is visible to a capability probe.

## Four decisions

**Judge on the worst frame, not the mean.** A scene at a steady 55fps with one 400ms hitch per
second averages fine and feels broken. The tail is what people perceive.

**Quick to drop, slow to climb.** Dropping costs a little fidelity; climbing into a tier the
device cannot hold costs a stutter, a drop and a visible oscillation. Two bad seconds to drop,
eight good ones to climb.

**Remember what already failed.** Hysteresis alone is not enough, and the smoke proved it: a
machine sitting right at the boundary — just missing at high, comfortable at medium — dropped,
waited out the eight good seconds, climbed, missed and dropped again, **80 tier changes in 400
samples**. Each failed attempt now doubles the good run needed to try that tier again, and after
three failures it is closed for the session. The device has said no three times; believing it a
fourth is a bug, not adaptation. Same scenario now: 5 changes in 400 samples.

**Never climb above the probe's ceiling.** That number is a statement about the hardware;
adaptation is a statement about the moment.

## One verdict per tab

`src/components/three/quality.ts` holds a single tier for the whole page. If each viewer adapted
on its own, two viewers on one page (the lab's stage and its microscope, say) could end up at two
different qualities, and a shade compared across them would be compared unfairly. They share a
GPU, so they share a verdict.

A drop reports `three.slow` through the client telemetry channel, so how often real devices fail
to hold their tier is answerable from the same pipeline as everything else.

`/admin/diagnostics` shows the effective tier and, when it differs, where it started —
`medium (from high)`.

## Verifying

```bash
npx tsx scripts/smoke-m29.ts
```

Adaptive quality is a feedback loop and the failure mode of a feedback loop is oscillation, so
most of this tests dynamics rather than single decisions:

- a sustained overrun drops the tier; a single hitch does not
- sustained failure reaches the floor and stops
- climbing needs eight good seconds where dropping needs two
- adaptation never exceeds the device's own ceiling
- **a borderline device settles rather than flapping** — the assertion that found the bug
- a healthy device is never disturbed at all
- a device that throttles and then stays cool climbs back, with the backoff it earned
