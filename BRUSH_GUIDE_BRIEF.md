# Build brief — "How to brush" animated guide (2-min timer)

A drop-in feature for the **morning-app** kids' routine. Adds a button on the
tooth-brushing task that opens a fun, animated, voice-guided **2-minute brushing
coach**: a cartoon mouth + toothbrush that demonstrates correct technique across
4 quadrants, with a countdown ring, Hebrew audio, sugar-bug sweeping, and an
end-of-session sticker reward.

> Execution target: **Fable**. This brief is the spec — build to the acceptance
> criteria at the bottom. Everything below is grounded in the current
> `index.html`; file/line references are where you hook in.

---

## 1. Stack & how it drops in (read this first)

- **Single file:** everything lives in `/Users/noa/morning-app/index.html`
  (~2133 lines). One `<style>` block, one `<script>` block. **No build step, no
  bundler, no libraries, no imports.** Plain ES5/ES6 in a `<script>` tag.
- **Served** by `npx serve` on port `8765` (see `.claude/launch.json`). Just
  reload the page — no compile.
- **State:** a single global object `S`. Persisted to `localStorage` via
  `save()`; loaded on boot via `load()`. Kids live in
  `const KIDS={yehonatan:{…}, yoav:{…}}` (line ~690). Active kid = `S.currentKid`;
  session = `S.session` (`'morning'` | `'evening'`).
- **Rendering:** string-template based. `render()` does
  `app.innerHTML = renderHeader()+…+renderNav()` then calls `bindEvents()`
  (line ~853). There is **no framework** — after every render, all click
  handlers are re-attached in `bindEvents()` (line ~1630).
- **Existing overlay pattern to reuse:** overlays are DOM nodes appended to
  `document.body`, dismissed with `ov.addEventListener('click',()=>ov.remove())`
  (see `.card-popup-overlay` CSS at line ~317 and usage near line ~1872). The
  brush guide should follow the same "create element → append to body → remove on
  close" pattern so it survives re-renders (it lives outside the `#app` innerHTML
  that `render()` overwrites).
- **Responsive breakpoint = 700px** (the app already uses it, line ~533):
  `@media(min-width:700px)` is **tablet** (`#app` is a centered column,
  `max-width:900px`, dual-column task view); `@media(max-width:699px)` is
  **mobile** (single column). The guide must respect the SAME breakpoint — see
  §3 for its container behavior (centered card on tablet, full-screen on mobile).
- **No audio/speech exists yet** in this app — you're adding it fresh (Web Speech
  API + a tiny WebAudio beep synth). It must be gated behind the user's Play tap
  (autoplay/speech policies require a gesture).
- **Language:** RTL Hebrew throughout. Keep all copy in **one strings object** so
  an English toggle is trivial later (see §7).
- **CSS variables already defined** (line ~14): `--pitch:#2E7D32`,
  `--gold:#FFB300`, `--card:#fff`, `--radius:16px`, `--shadow`, etc. The app's
  theme is a green "soccer pitch" (blue in evening mode). **The brush modal uses
  its OWN soft-pastel palette** (§6) — it's a self-contained calm world — but
  reuse the app's overlay chrome, border-radius, and shadow tokens for
  consistency.

### Integration point — the button

The tooth task renders in **two** row templates (both must get the button):

1. **Mobile single view** — `renderTasksView()`, the `.task-item` template at
   **line ~985**: `<div class="task-item …" data-task="${t.id}">…`
2. **Tablet dual-column view** — `renderKidColumn()`, the `.col-task` template at
   **line ~913**: `<div class="col-task …" data-col-task="${t.id}">…`

The teeth task ids are **`teeth`** (morning) and **`ev_teeth`** (evening). When
`t.id === 'teeth' || t.id === 'ev_teeth'`, inject a small pill button inside the
row, e.g.:

```html
<button class="brush-guide-btn" data-brush-guide aria-label="איך מצחצחים">
  ▶ איך מצחצחים
</button>
```

**Critical:** the whole task row is a toggle-done target. In `bindEvents()` the
`[data-task]` handler (~line 1647) and `[data-col-task]` handler (~line 1708)
mark the task done on click. The guide button must **`e.stopPropagation()`** in
its own handler so opening the guide does NOT also tick off "brushed teeth".

Wire it once in `bindEvents()`:

```js
document.querySelectorAll('[data-brush-guide]').forEach(el=>{
  el.addEventListener('click',e=>{ e.stopPropagation(); openBrushGuide(); });
});
```

`openBrushGuide()` builds the overlay (appended to `body`), runs the state
machine, and on close tears everything down (clear interval, `speechSynthesis.cancel()`,
close/`suspend` the AudioContext, `overlay.remove()`).

---

## 2. Core mechanic — 2 minutes = 4 zones × 30s

The heart of it. 120s split into four 30s quadrants, in dentist order:

| Zone | Time | Quadrant | Hebrew announce |
|------|------|----------|-----------------|
| 1 | 0:00–0:30 | Upper right | `עכשיו למעלה מימין!` |
| 2 | 0:30–1:00 | Upper left  | `עכשיו למעלה משמאל!` |
| 3 | 1:00–1:30 | Lower left  | `עכשיו למטה משמאל!` |
| 4 | 1:30–2:00 | Lower right | `עכשיו למטה מימין!` |

Within each 30s zone, the brush demonstrates **three surfaces in order**, ~10s
each: **outer (cheek side) → inner (tongue side) → chewing top**, using small
gentle circles held at ~45° to the gum line. A quick **tongue-brush flourish**
plays in the final ~3–4s of zone 4 (or as a short 5th micro-step after 2:00 —
your call; keep total felt time ≈ "two minutes").

Drive **all animation from one clock**. Suggested model:

```
tick every 100ms → elapsedMs
zoneIndex   = min(3, floor(elapsed / 30s))
inZone      = elapsed - zoneIndex*30s          // 0..30s
surfaceIdx  = min(2, floor(inZone / 10s))      // 0 outer,1 inner,2 top
remaining   = max(0, 120s - elapsed)
```

On `zoneIndex` change: chime + speak the new zone + move highlight/brush + reset
that quadrant's sugar bugs. On `surfaceIdx` change: reposition brush to the
surface, optional soft cue. At `elapsed >= 120s`: go to **complete**.

---

## 3. Screen layout — three bands, responsive container

### Container behavior (important)

- **Tablet (≥700px): a centered modal CARD, not full-bleed.** The card floats in
  the middle of the viewport and **the app screen stays visible underneath** — so
  the backdrop is **light/translucent** (e.g. `rgba(0,0,0,.25)`, optionally a
  subtle `backdrop-filter: blur(2px)`), NOT the app's usual opaque
  `rgba(0,0,0,.7)`. Size the card ≈ `min(560px, 92vw)` wide, `max-height:92vh`,
  rounded corners + soft shadow, so it reads as "a panel over the app," not a new
  screen.
- **Mobile (<700px): full-screen cover.** The card expands to fill the viewport
  (100vw × 100dvh, no gap), since there's no room to show anything underneath.
- Implement as one overlay whose inner `.brush-card` switches via the **700px**
  media query (fill on mobile, centered card on tablet). Tapping the light
  backdrop on tablet may close the guide (same as other overlays); on mobile
  there's no exposed backdrop, so rely on the **X** button.

### Persistent close (X) — required

- A **large, always-visible "✕" button** sits in the **top corner of the card**
  (top-left reads naturally in RTL; either corner is fine as long as it's
  obvious and not overlapping the mascot). Big tap target (≥44px).
- It is present and tappable in **every** state — idle, running, paused, complete
  — so a kid or parent can close mid-session at any time. Closing always tears
  the guide down cleanly (§5) — no "are you sure," no failure framing.

### The three bands (top→bottom, inside the card)

Pastel scene. Top→bottom:

**Top band — mascot + speech bubble.** A friendly rounded tooth mascot (white
tooth, big eyes, smile) in a speech bubble cheering the current step in Hebrew
(`עכשיו למעלה מימין!`, `מעולה, ממשיכים!`, `כמעט סיימנו!`). Bubble text updates on
each zone/surface change and pulls from the strings table.

**Center (the star) — the mouth.** A **3D "dentist-chart" view**: two horseshoe
dental arches seen from the front-above (upper ∩ on top, lower ∪ below, with
uvula + tongue between), so the kid sees EVERY tooth — front incisors at the
middle of each curve, big back molars at the deep ends. The **active quadrant
glows** (soft mint arc). The chunky smiley toothbrush **sweeps front → back
molar → front once per 10s surface pass**, so reaching the back teeth is
demonstrated, not implied; mid-zone voice cheers reinforce it («מגיעים עד הסוף
מאחורה!»). Sparkles pop on teeth as they're "cleaned." **Sugar bugs** (§6) sit
one near the front and one **on the back molar** of each quadrant and get swept
away as the brush passes.

**Bottom band — timer + controls.** A large circular ring around the `2:00`
countdown; the ring is **divided into 4 segments** that fill as each zone
completes. Below: **play/pause**, **restart**, **mute** buttons, and **4 zone
dots** that light up for progress.

---

## 4. SVG structure (default approach — no libraries)

Use **inline SVG animated with CSS/JS**. Lightweight, crisp at any size, fully
timer-controllable, zero assets. (Lottie is the richer-motion alternative but
needs a sourced JSON + more setup — start with SVG.)

Suggested single `<svg viewBox="0 0 400 640">` with grouped layers, each
addressable by id so the JS clock can drive them:

```
<svg viewBox="0 0 400 640" id="brushScene">
  <!-- BAND 1: mascot -->
  <g id="mascot"> tooth body + eyes + mouth (smile morphs on complete) </g>
  <g id="speechBubble"> <foreignObject> RTL Hebrew text </foreignObject> </g>

  <!-- BAND 2: mouth -->
  <g id="mouth">
    <path id="gums" …/>                     <!-- pale pink -->
    <g id="teethUpper"> 7–8 <rect rx> teeth </g>
    <g id="teethLower"> 7–8 <rect rx> teeth </g>
    <rect id="quadGlowUR"/> <rect id="quadGlowUL"/>   <!-- mint highlights -->
    <rect id="quadGlowLL"/> <rect id="quadGlowLR"/>   <!-- toggle .active -->
    <g id="sugarBugs"> googly blobs, one cluster per quadrant </g>
    <g id="brush">                          <!-- chunky, smiley, angled ~45° -->
       <g id="bristles"/> <g id="handle"/>
    </g>
    <g id="sparkles"/>                       <!-- spawned on clean -->
  </g>

  <!-- BAND 3: timer -->
  <g id="timerRing">
    <circle id="ringTrack"/>                 <!-- 4 arc segments -->
    <circle id="seg0"/><circle id="seg1"/><circle id="seg2"/><circle id="seg3"/>
    <text id="countdown">2:00</text>
  </g>
</svg>
```

Animation notes:
- **Brush motion:** small-radius circular wiggle via a JS-updated `transform`
  (translate to surface anchor + a `sin`-based tiny orbit), tilted ~45°. Keep it
  gentle — no fast scrubbing.
- **Quadrant glow:** toggle an `.active` class (mint fill + soft pulse keyframe).
- **Ring segments:** 4 arcs using `stroke-dasharray`/`stroke-dashoffset`; each
  fills over its 30s window. The whole ring = 120s.
- **Sparkles / bubbles:** spawn a few `<circle>`/`<path>` with a short
  fade-float-up CSS animation, then remove.
- **Sugar bugs:** on brush-pass over a quadrant, add `.swept` (float away + fade)
  and pop a bubble. Adorable, googly-eyed, never creepy.
- Controls (buttons/dots) can be **HTML over the SVG** rather than in-SVG — the
  overlay is a normal DOM node, so mix freely.

Keep everything driven by the §2 clock so pause/restart/seek stay perfectly in
sync with the visuals.

---

## 5. States & controls

`idle → running → paused → complete` (plus `restart` back to `idle`/`running`).

- **Idle / start screen:** mascot waves, big **▶ Play** button, optional tiny
  parent tip card (§9). Nothing animates yet (no audio before the tap).
- **Running:** clock ticks, brush animates, voice + chimes fire on transitions.
- **Paused:** freeze clock and all animation; `speechSynthesis.pause()` (or just
  stop future utterances); show ▶ to resume. **Pausing must never feel like
  failure** — no scary/negative copy.
- **Complete (at 2:00):** stop clock; mascot beams with a sparkling smile; gentle
  confetti; a **star/sticker earned**; cheerful "ta-da" jingle + spoken
  `כל הכבוד! שיניים נקיות!`. Show a **"מצחצחים שוב מחר 🌙"** note and a **סיום**
  (close) button. Optionally offer **"סמן שציחצחתי ✓"** that marks the teeth task
  done (call the same toggle the row uses) — keep it a separate choice, not
  automatic.
- **Controls:** play/pause, restart, mute, and the **always-visible ✕ close**
  (§3) shown in every state. Mute toggles both speech and chimes; persist the
  preference in `S` (e.g. `S.brushMuted`) via `save()` so parents set it once.

**Sticker collection (return hook):** store earned stickers per kid, e.g.
`S[kid].brushStickers = []` (array of `{date, icon}`), persisted via `save()`.
Show a small growing row of earned stickers on the start screen ("collect one
each morning"). This is the reason to come back daily.

---

## 6. Art direction — fun, not scary (hard requirement)

**Avoid:** realistic dark open mouths, blood-red raw gums, sharp teeth,
aggressive scrubbing, loud jarring sounds, grotesque germs.

**Instead:**
- Rounded everything, thick friendly outlines, no sharp edges.
- **Pastel palette** (modal-local CSS vars — do NOT reuse the green pitch theme
  for the scene):
  - mint green `#B9F6CA` (active-quadrant glow / accents)
  - sky blue `#81D4FA` (brush, ring progress)
  - pale pink gums `#F8BBD0`
  - warm cream background `#FFF8E1`
  - white teeth `#FFFFFF` with a soft gray outline `#CFD8DC`
  Bright but calm.
- Toothbrush has a tiny smiley face and leaves a trail of bubbles/sparkles.
- **Sugar bugs (חיידקי סוכר):** round, googly-eyed, friendly blobs on the teeth
  that get happily swept away in bubbles as the brush passes. Give the kid a job
  ("!תפסו את כולם"). Keep them adorable.
- **End reward:** gentle confetti, beaming sparkly mascot, earned star/sticker,
  cheerful "ta-da."

---

## 7. Strings (one object, Hebrew default)

Put every user-facing string here; UI + voice read from it. English is a later
toggle (`LANG='he'`), same keys.

```js
const BRUSH_STRINGS = {
  he: {
    open:        'איך מצחצחים',
    start:       'מתחילים!',
    play:'▶ נגן', pause:'⏸ עצור', restart:'↺ מהתחלה', mute:'🔇', unmute:'🔊',
    close:       'סיום',
    zones: [
      'עכשיו למעלה מימין!',
      'עכשיו למעלה משמאל!',
      'עכשיו למטה משמאל!',
      'עכשיו למטה מימין!',
    ],
    surfaces: ['בחוץ','בפנים','למעלה על השיניים'], // outer / inner / chewing top
    tongue:      'ועכשיו הלשון!',
    cheers:      ['מעולה, ממשיכים!','כל הכבוד!','אתם אלופים!','כמעט סיימנו!'],
    catchBugs:   'תפסו את כל חיידקי הסוכר!',
    done:        'כל הכבוד! שיניים נקיות! ✨',
    tomorrow:    'מצחצחים שוב מחר 🌙',
    markDone:    'סמן שציחצחתי ✓',
    stickerEarned:'הרווחת מדבקה!',
    parentTip:   'משחת שיניים בגודל אפונה • מבוגר עוזר לקטנטנים',
  },
};
```

---

## 8. Audio (big for pre-readers)

- **Web Speech API** (`speechSynthesis` + `SpeechSynthesisUtterance`), warm rate
  (~0.9). Speak each zone change from `BRUSH_STRINGS.he.zones[i]`, plus
  `cheers`. **Voice lookup must match `/^(he|iw)/`** — Android TTS engines report
  Hebrew with the legacy ISO code **`iw-IL`**, and matching only `he` silently
  drops all speech (real bug found on the kids' tablet). Set the utterance's
  `lang` from the matched voice. Also avoid the cancel-then-speak race: if the
  engine is speaking/pending, `cancel()` then `speak()` after a ~60ms delay
  (same-tick speak after cancel is dropped on some Android engines). **Init only
  after the Play tap** (voices load async — hook `onvoiceschanged`).
- **Sound cues** via a tiny WebAudio oscillator synth (no files):
  - gentle **chime** on each 30s zone transition,
  - bubbly **pop** when sugar bugs clear,
  - happy **jingle** at 2:00.
- **Mute toggle** kills both speech and cues; persisted (§5). Respect it on load.
- All audio must not throw on browsers that lack it — feature-detect and no-op.

---

## 9. Parent-facing tip (bake in, don't clutter)

On the idle/start screen, a tiny optional tip card:
> 🫛 **משחת שיניים בגודל אפונה** · מבוגר עוזר לקטנטנים

Keeps it dentist-accurate (pea-sized paste; grown-up helps little ones) without
crowding the fun. Dismissible / small.

---

## 10. Acceptance criteria

- [ ] A **"▶ איך מצחצחים"** button appears on the teeth task in **both** the
      mobile `.task-item` (`data-task`) and tablet `.col-task` (`data-col-task`)
      rows, for **both** `teeth` (morning) and `ev_teeth` (evening).
- [ ] Tapping the button opens the guide and **does not** toggle the task done
      (`stopPropagation`). Tapping elsewhere on the row still toggles done.
- [ ] Overlay is appended to `body`, survives an app re-render, and fully tears
      down on close (interval cleared, `speechSynthesis.cancel()`, audio context
      closed, node removed). No leaks, no lingering voice after close.
- [ ] **Responsive container:** on **tablet (≥700px)** the guide is a **centered
      card** with the app **visible underneath** (light/translucent backdrop, not
      opaque); on **mobile (<700px)** it **fills the screen**. Uses the app's
      existing 700px breakpoint.
- [ ] A **large, always-visible ✕** in the card's top corner closes the guide in
      **every** state (idle/running/paused/complete), tearing down cleanly. No
      confirm dialog, no failure framing.
- [ ] Timer runs exactly **120s**, split into **4×30s** zones; within each zone
      the brush visits **outer→inner→top** (~10s each); a **tongue flourish**
      plays at the end.
- [ ] The **active quadrant glows** and the **brush is over those teeth**,
      matching the current zone at all times (single-clock sync).
- [ ] Circular ring shows the countdown and **fills in 4 segments**; **4 zone
      dots** light up as zones complete.
- [ ] **Play / pause / restart / mute** all work; pause freezes visuals+audio and
      resumes cleanly; **restart** returns to 0:00.
- [ ] Hebrew **voice** announces each zone (he-IL) and **chimes** mark
      transitions; **mute** silences everything and is **remembered**.
- [ ] Art matches §6 (pastel, rounded, friendly) — **no scary triggers**; sugar
      bugs (if included) are cute and get swept away.
- [ ] On completion: confetti + beaming mascot + **sticker earned & saved**
      (`S[kid].brushStickers`, persisted), "brush again tomorrow" note, and an
      optional **"סמן שציחצחתי ✓"** that marks the teeth task done.
- [ ] RTL correct; all copy from `BRUSH_STRINGS`; **no external libraries**; still
      one self-contained `index.html`.
- [ ] Works offline (PWA) and on the tablet at the `serve` port; no console
      errors.

---

## 11. Defaults chosen for you

- **Animation:** inline SVG + CSS/JS (not Lottie). Start simple; polish later.
- **Language:** Hebrew (RTL) default, strings in one object for an easy English
  toggle.
- **Scope:** the guide is a **coach**, decoupled from task completion — it never
  auto-checks the task; completing it only *offers* to mark done.
- **Persistence:** reuse the app's `S` + `save()`/`load()` for mute + stickers;
  no new storage mechanism.
</content>
