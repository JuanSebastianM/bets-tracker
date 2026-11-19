# Accessibility

What was checked, how, what was fixed, the conventions a new screen must follow, and, honestly, what
no one has checked yet with a real screen reader on a real phone.

Short version: every route and the open states (filter sheet, pick, open test, glossary term, decision,
simulator blocks, scenario B, saved filters, toasts, the offline banner) pass a hand-written audit at
390 px and 1280 px, in Spanish and English, in both themes, and the keyboard flows are tested end to
end. That is a check of the **page as the browser exposes it to assistive technology**. It is not a
check of what VoiceOver or TalkBack actually say; see the last section.

## 1. How it is checked

No rule engine (axe, pa11y, Lighthouse) is available in the workspace or CI, so the checks are written
by hand in `tests/e2e/a11y-audit.js` and run by `tests/e2e/a11y.spec.js` in `npm run check`.

- **Names, roles and states** come from Chrome's own accessibility tree (CDP
  `Accessibility.getFullAXTree`), so a name is what a screen reader receives, not a guess from the DOM.
  Every operable role (button, link, textbox, combobox, radio, checkbox, slider, tab, summary…) must have
  a name; a name may not be an icon id, a raw i18n key (`filters.title`) or the role itself.
- **DOM rules**: no positive `tabindex`; no duplicate ids; every `aria-labelledby`, `aria-describedby`
  and `aria-controls` points to an element that exists; exactly one `main`; every `nav` named and no two
  visible ones with the same name; exactly one `h1`, the first heading is the `h1`, no skipped levels;
  `<html lang>` equals the UI language; every table has header cells and a caption or name; every `svg`
  is hidden or named; every `img` has `alt`; no stylesheet rule that reveals something on `:hover`
  without a `:focus` twin.
- **Contrast from the rendered colours**: for every text node, the foreground (with the opacity of
  every ancestor) is composited over the effective background (every ancestor's background colour, down
  to the page), and must reach 4.5:1 (3:1 at 24 px, or 18.66 px bold). Placeholders too. Non-text
  contrast (3:1): the boundary of every field and control against what surrounds it (border or fill,
  whichever is stronger), icon-only buttons, chart lines, bars and dots, and the focus ring on every
  surface token. Disabled controls are exempt (WCAG). Failures report the selector and both colours.
  `tests/unit/a11y.test.mjs` also checks the token pairs straight from `src/styles/tokens.css`, so a
  token change that breaks AA fails before any browser runs.
- **Touch targets** on the phone viewport: every visible control at least 44 × 44 CSS px, counting an
  absolutely placed `::before`/`::after` that extends the tap area (the kit's pattern, below), the label
  of a checkbox, and the box of the search field. Links inside a sentence are exempt (WCAG 2.5.8).
- **Keyboard**: skip link; the rail moves to a section and focus lands on its `h1`; on every route,
  25 Tab stops are each visible (outline or ring, also through `:focus-within`), on screen, and never
  the page body; the filter sheet (focus moves in, Tab and Shift+Tab stay inside for 60 presses, Space
  toggles a chip and `aria-pressed` follows, Enter opens a section and `aria-expanded` follows, Escape
  closes and focus returns to the opener); radio groups (one Tab stop, arrows, Home, End); pagination
  to the last page; a pick opened with Enter, previous / next, Escape; table sorting sets `aria-sort`;
  accordions and disclosures; the glossary search; the decisions timeline.
- **Live regions**: every count that changes with a filter (`aria-live="polite"`), the sync announcer
  (a refresh the user asked for, offline), the toaster container.
- **Reflow**: every route at 320 px wide, and every route at 390 px with the root font at 200%, has no
  sideways page scroll.
- **Motion**: with `prefers-reduced-motion: reduce` no animation lasts 1 ms or more and nothing scrolls
  smoothly.
- **Reading by hand**: `A11Y_DUMP=<dir> npm run test:e2e -- tests/e2e/a11y-dump.spec.js` writes, for
  every route, the page as a screen reader in browse mode would read it, one line per control or
  paragraph (`[button] Filtros, 1 activo`, `[radio] Fija (checked=true)`), plus the audit of each
  route. Reading those streams found the problems no rule catches (a bare "2" on a section, "0 nulas,
  0 medias", a stray "u", the record spoken as digits).

## 2. What was fixed

Contrast (tokens in `src/styles/tokens.css`; every place they are used was checked in the screenshots):

| What | Before | After |
|---|---|---|
| Pending chips (`--c-pending` on `--c-pending-soft`, light) | 4.47:1 | `#8a5a0b`, 4.97:1 |
| Void badge (`--c-void` on `--c-void-soft`, light) | 4.03:1 | `#5d6a73`, 4.60:1 |
| Field and control borders (`--c-line-strong`) | 1.87:1 light, about 1.6:1 dark | new `--c-control-line` (`#778690` / `#5e7280`), 3:1 or more on every surface |
| Placeholders (browser default) | 3.67:1 on dark | `--c-muted` |
| Record separators "–" | 1.87:1 | `--c-muted` |
| Small-sample rows in Analysis (opacity 0.55, back to 0.9 only on hover) | about 2.1–3.9:1 | full opacity, greyed with `--c-muted` |
| Small-sample bars of the range chart (opacity 0.5) | about 3.3:1 | muted colours, dashed band |
| Count on a selected chip, counts on segments (opacity) | 4.42:1, 4.15:1 | full opacity |
| Selected segment | told apart by a 1.07:1 fill | also a 3:1 inner border and bolder label |

Touch targets (44 px, mostly without changing the look: an invisible `::after` extends the area):
filter and active-filter chips (measured 42 px: the old `inset: -4px` is placed on the padding box),
segments (38), link buttons such as "Ver como tabla" (32), the glossary link lines under tables (30),
decision topics (19) and status / theme chips, the tag link in a pick (22), the selects of the Explorer
and Analysis (40), the closest-test link (32), the month jump and rule chips of Decisiones (36), the
glossary links and decision rows (36 / 19), Analysis row names, the "2u" stake chip (42 wide). The
"Fila N" link beside every decision topic went to the same page as the topic: it is now out of the Tab
order and hidden from screen readers (still tappable), which also removes 15 repeated links per page.

Names, roles and states:
- A filter section with active filters was named "Tipo de mercado 2" (the `aria-label` on the badge
  `span` is ignored by browsers): now "Tipo de mercado, 2 activos".
- `aria-controls` pointed at panels that are not rendered while closed (filter sections, tests, the
  decision filters): now only while open.
- "Filtros guardados" / "Para empezar" were `h4` right after the sheet's `h2`: now `h3`.
- The record was read as "6 ganadas, 12 perdidas, 2 nulas, 0 medias" and "1 medias": now the parts
  that are not zero, singular and plural right (`spokenRecord`, `src/lib/spoken.js`).
- Pick cards read "… 3.94 Pendiente": now "… cuota 3.94 …".
- Number fields read "u Bank inicial" (the unit was a loose word): the unit is hidden from screen
  readers and the label says "Bank inicial, en unidades".
- In the English UI the sheet's own Spanish text (decision topics and text, notes, the sheet's tag
  labels) is marked `lang="es"`, so a screen reader can switch voice (`sheetLang`).
- Toasts had `role="status"` inside a live container (some readers announce twice): only errors keep
  `role="alert"`.

Keyboard and focus:
- Segmented controls declared `role="radio"` but every option was a Tab stop and arrows did nothing:
  now one Tab stop, arrows / Home / End choose (the ARIA radio pattern; `onRadioKey` in `controls.js`).
- Pagination: pressing "next" onto the last page disabled the focused button and focus fell to the
  page body: it now moves to the other button. The same for a pick's previous / next, which also used to
  land on the sheet's close button because the sheet mounts again for the new pick.
- The refresh button became `disabled` while refreshing, dropping focus: it is now `aria-disabled`.

Announcements: a polite live region that always exists (`sync-announcer` in `src/app.js`) says
"Actualizando los datos…" / "Datos actualizados." for a refresh the user asked for and "Sin conexión: se
ve la copia guardada." / "No se pudo actualizar…" for any failure. The stale banner alone was inserted
with its text, which screen readers often do not announce.

Reflow at 200% text: the page title shrank to zero width next to the sync stamp (now the stamp wraps
under it); the tab bar's labels overflowed; cards, one-column stacks, key–value lists, chips (a
missing-column chip in Settings pushed the page 186 px wide), buttons, segments, the Analysis part
links and the close-range figures now wrap instead of overflowing.

## 3. Spoken forms of figures

The visible figure never changes (tests and the auditor read it); where its spoken form is ambiguous,
the spoken form goes next to it in `sr-only` text or in the name of the control.

| Visible | Spoken | Where |
|---|---|---|
| `73–87–4`, `15–19 +1 media` (the scoreboard; halves in words since round 2, "+1½" read as one and a half) | "73 ganadas, 87 perdidas, 4 nulas", "15 ganadas, 19 perdidas, 1 medio ganada" (zero parts left out; halves by kind) | `spokenRecord` |
| a bare section count `2` | ", 2 activos" | filter sections |
| `3.94` on a pick card | "cuota 3.94" | `PickCard` |
| a field's unit `u` | "…, en unidades" in the label | `NumberField` |
| `+2.74u`, `−1.00u` | left as is: "más 2.74 u" / "menos 1.00 u"; "u" is the sheet's own notation and is in the Glossary | everywhere |
| `±`, `%`, `−` (U+2212) | left as is: screen readers say "más menos", "por ciento", "menos" | everywhere |

Rules for new text: never let a record stand alone without `spokenRecord` next to it; a bare number in
a control needs its noun in the name; put units in labels, not as loose words beside a field; use the
real minus sign (`format.js` does) so it is read as "menos", not "guion".

## 4. A new component: what to do

- Use the kit: `Button`, `IconButton` (its `label` is the name), `FilterChip` (`aria-pressed`),
  `SegmentedControl` (radio group with arrows), `Select`, `NumberField` (`unit` is spoken), `SearchInput`,
  `BottomSheet` (focus in, trapped, Escape, back to the opener), `DataTable` (caption, `aria-sort`),
  `Disclosure`. Do not build a toggle out of a `div`.
- Every icon is decorative (`aria-hidden`) unless it is the only content: then `label`.
- One `h1` per route (the shell's title). Card titles are `h2`; inside a card or a sheet, `h3`. Do not
  skip a level for size: style it.
- A count or result that changes with a filter goes in an element with `aria-live="polite"` that is
  already on the page before it changes.
- A button that can disable itself while focused must hand focus to something else (see `Pagination`,
  `PickDetail`), or use `aria-disabled`. The kit's `Button` and `FilterChip` do this on their own since
  round 2 (`useFocusSafeDisabled`): focused when they become disabled, they stay focusable and
  `aria-disabled` until focus moves on.
- Colours only from tokens. Text on a surface: `--c-ink`, `--c-ink-2`, `--c-muted` or a result colour;
  never lower the opacity of text to make it secondary (use `--c-muted`). Field borders:
  `--c-control-line`.
- Touch area 44 × 44 px on phones. If the look must stay smaller, give the element
  `position: relative` and an `::after { content: ''; position: absolute; inset: -Npx 0 }` where N makes
  the padding box plus 2N reach 44 (a 36 px chip with a 1 px border needs `-5px`).
- Sheet text shown in the English UI gets `lang=${sheetLang(locale)}`.
- Add the route to `ROUTES` (and an open state to `STATES` in `a11y.spec.js` if it has one): the audit
  then covers it in both languages, both themes and both sizes.

## 5. Not verified by a human with VoiceOver or TalkBack

Nothing here was heard. Chrome's accessibility tree is what VoiceOver and TalkBack start from, but each
reader has its own habits (how it reads "−4.4%", whether it announces a polite region while you type,
how it treats `aria-modal`, which language voice it picks). These are the ten things most worth five
minutes on a real phone, in the order to try them. On iPhone: Settings → Accessibility → VoiceOver
(triple-click the side button toggles it); swipe right to move, double-tap to activate. On Android:
Settings → Accessibility → TalkBack; same gestures.

1. **Open the app and swipe through the Resumen.** Does it say the page title "Resumen" first? Under
   Sombra, does the record sound like "73 ganadas, 87 perdidas, 4 nulas" (good) and is "+5.42u" read in a
   way you understand ("más cinco punto cuarenta y dos u")?
2. **Listen to a written summary.** In the "Sombra: 73-87-4 a cuota media 2.69…" sentence, how is
   "73-87-4" read: as a record, as a date, as a subtraction? (The scoreboard has a spoken form; the
   sentences do not yet.) Also listen to a price with three decimals, such as "4.073" in the Explorador:
   a Spanish voice may read "cuatro mil setenta y tres".
3. **Tap "Filtros" in the Explorador.** Does it announce a dialog called "Filtros"? Swipe: does it stay
   inside the sheet, or can you reach the list behind it?
4. **Turn a chip on in the sheet** (for example "VALOR CASI"). Does it say "seleccionado" / "pressed"
   after the double-tap, and does it then say the new count ("18 picks con estos filtros") on its own?
5. **Close the sheet** with the close button and with the two-finger scrub (VoiceOver) or back gesture
   (TalkBack). Does focus come back to the "Filtros" button?
6. **Change "Periodo" on the Resumen** (Todo, 30 días…). Does each option say "botón de opción,
   seleccionado / no seleccionado, 1 de 4", and does the choice stick after a double-tap?
7. **Type in the Explorador search.** Does it read the new count after you stop typing, or after
   every letter (too chatty), or never?
8. **Open a pick and use "Siguiente".** After each tap, are you still on "Siguiente", and does it read
   the new position ("2 de 185")?
9. **Switch the app to English in Ajustes and open a decision.** Does the topic and text (Spanish, from
   the sheet) switch to a Spanish voice, while the buttons stay in English?
10. **Refresh in airplane mode** (double-tap "Actualizar datos" with no connection). Do you hear "Sin
    conexión: se ve la copia guardada."? Then with the connection back: "Datos actualizados."?

Also worth a look without a screen reader: **Android's font size at its largest** (Settings → Display →
Font size) and **iOS Larger Text**; the lab checked 200% of the app's own sizes, not the phone's text
scaling of every element. And **Switch Access / an external keyboard** on a tablet.

Known gaps, not fixed here:
- Records inside generated sentences ("Sombra: 73-87-4…", `src/data/summaries.js`) and in some table
  cells are still digits with hyphens; their spoken form would change text that tests and the auditor
  read. A screen-reader-only twin of each sentence is the next step.
- Test names of the Tests section come from `src/data/tests-config.js` in Spanish; since round 2 they
  are marked `lang="es"` in the English UI on the Tests screen (not yet in the filter panel's test chips).
- "u" after a figure is not expanded to "unidades" outside fields; the stake chips are named "2u".
- Charts have a caption and a "Ver como tabla" table; the curve's points are not explorable one by one.
