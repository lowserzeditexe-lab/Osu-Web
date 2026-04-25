# PRD — webosu2 (osu! web clone)

## Original problem statement
Continuer le système de "loose" (HP / fail) pour le moteur **webosu2**, et aligner
les mécaniques de jeu avec la documentation officielle **osu!stable**.

Choix utilisateur (verbatim) :
- **HP drain UNIQUEMENT sur miss**, soin léger sur hit. Pas de drain passif.
- Calibration osu!stable (calcul officiel des scores, mods, sliders, pp).
- Mods manquants (NF, SD, PF, FL, DT, HT) à ajouter.
- Réponses agent : **français uniquement**.

## Architecture
- `frontend/public/webosu2/` — moteur de jeu (Vanilla JS + PIXI.js v6).
  - `scripts/playback.js` — boucle de gameplay, hit-windows, mods, sliders.
  - `scripts/overlay/score.js` — UI score/HP/combo/accuracy + écran death/results.
  - `scripts/playerActions.js` — mouse/keyboard/touch/auto/relax/autopilot.
  - `settings.html` + `scripts/settings.js` — sélection mods + menu principal.
- `backend-node/` — proxy Node vers l'API osu! (clé `OSU_CLIENT_ID/SECRET` dans `.env`).

## Done (this fork)
### 25 Apr 2026 — Phase A (Mods manquants)
Ajout NF, SD, PF, FL, DT, HT — UI dans settings.html + logique dans playback.js / score.js.

### 25 Apr 2026 — Phase B (Score officiel)
Score formula corrigée : `BaseHitValue × (1 + (Combo × DifficultyMultiplier × ModMultiplier) / 25)`.
DifficultyMultiplier = `floor((CS + HP + OD) / 38) + 2` clampé à [2..6].

### 25 Apr 2026 — Phase C (Slider Judgement final) — **CURRENT**
- `score.js` :
  - `hitTick(score, time, breakCombo=true)` : score + combo + HP par composant
    de slider, sans contribution à la précision. Soin léger sur hit, pénalité
    moitié-miss sur miss. Le drapeau `breakCombo=false` permet à l'extrémité
    finale du slider de ne pas casser le combo (règle stable).
  - `commitAccuracy(elementsHit, elementsTotal, time)` : calcule **une seule
    fois** par slider le jugement final (300 si 100% des composants touchés,
    100 si ≥50%, 50 si >0%, Miss sinon) et l'applique à la précision +
    judgecnt + SD/PF instafail.
- `playback.js` :
  - `createSlider` initialise `hit.elementsTotal = 1 + ticks + repeat`,
    `elementsHit`, et marque chaque judgement comme `isSliderHead` /
    `isSliderEdge` / `isSliderEnd`.
  - `hitSuccess` route les heads de slider vers `hitTick` (et incrémente
    `elementsHit` si touché).
  - `updateJudgement` traite les misses de composants slider via `hitTick`
    sans contribuer à la précision.
  - Tick activé / edge activé → `hitTick(10|30, time)` + `elementsHit++`.
  - À la fin du slider (`-diff >= sliderTimeTotal`), appel unique à
    `commitAccuracy()` → 1 jugement aggregé pour la précision.

### 25 Apr 2026 — Phase D (pp réaliste)
- **Bug critique corrigé** : `scripts/overlay/pp.js` exportait `calculateMaxCombo`
  qui n'était pas défini → ReferenceError au chargement du module → `score.js`
  retombait systématiquement sur `legacyEstimatePp` (proxy log10(total)).
- **Nouveau pp.js** structurellement osu!stable :
  - `calculateMaxCombo(track)` : somme `1 + ticks + repeat` par slider
    + 1 par circle/spinner. Estime les ticks via beat duration / tickRate
    quand les sliders ne sont pas encore initialisés.
  - `calculateStars(track, {mods})` : strain à décroissance exponentielle
    (aim 750ms, speed 350ms) bucketé par sections de 400ms (peaks osu!stable).
    Aim inclut vélocité + bonus angle + bonus jump distance + slider velocity.
    Speed inclut tap rate + pénalité doubletap. Combinaison L^1.1.
  - `calculatePP({stars, accuracy, c300/100/50/miss, maxCombo, mods, OD, AR, CS})` :
    aim/speed/acc séparés avec length bonus, miss penalty (0.97^miss),
    combo scaling ((combo/max)^0.8), AR factor (>10.33 ou <8), HD/FL/NF
    multipliers, AR/OD effectifs après DT/HT (rate scaling). Combinaison
    L^1.1 + global multiplier 1.12. RL/AP/AT → 0 pp.
- `score.js` : utilise `calculateMaxCombo(track)` quand `track.maxCombo`
  manque (au lieu du fallback hit-count brut).

### 25 Apr 2026 — Animation death (P2 cochée)
- `play.html` : nouveau CSS `#death-vignette` (radial gradient rouge +
  pulse animé via ::before) et `#game-area.is-dying canvas` (filter
  saturate/brightness/blur/hue-rotate + zoom subtil).
- `playback.js` (branche HP < 0) :
  1. Audio : ramp `playbackRate` 1.0→0.35 et `gain` 1→0 sur 0.9-1.05s
     (slow-mo + fade-out), puis `audio.pause()` à T+1200ms.
  2. DOM : injecte `<div id="death-vignette">` dans `<body>` puis
     `requestAnimationFrame(() => addClass('show'))` pour déclencher
     l'opacity transition (1100ms cubic-bezier).
  3. Tint PIXI : lerp smooth `background.tint` vers `0x331111` sur 1500ms
     via RAF (avec fallback simple si performance.now() absent).
  4. `showDeathMenu()` retardé de 1400ms (au lieu d'immédiatement) pour
     que la slow-mo se résolve avant que le menu apparaisse.
- `score.js` (`showDeathMenu` cleanup) : retire `.is-dying` du `#game-area`
  et supprime `#death-vignette` du DOM avant de relancer le retry/quit.

### 25 Apr 2026 — Bugfixes : retry après mort + Phase D bis (rosu-pp-js WASM)

**Bugfix : die → retry → die ne déclenchait plus la mort**
- `playback.js` constructor n'initialisait pas `self.dead`. Après une mort
  + retry, `self.dead === true` empêchait la branche HP < 0 de se redéclencher.
  Ajout de `self.dead = false` au reset du constructor.
- `osu-audio.js play()` ne ré-initialisait pas le gain. L'animation death
  rampe `gain → 0` en 1.05s ; le GainNode est partagé entre les plays, donc
  retry → audio silencieux. Ajout d'un `cancelScheduledValues` +
  `setValueAtTime(1.0, now)` au début de `play()`.

**Phase D bis : rosu-pp-js (WASM, bit-for-bit avec osu.ppy.sh)**
- Téléchargement du build pré-compilé `rosu_pp_js_web.tar.gz` (target=web,
  ESM-ready) depuis les releases GitHub officielles
  (`MaxOhn/rosu-pp-js@v4.0.1`) et auto-hébergement sous
  `scripts/lib/rosu/{rosu_pp_js.js, rosu_pp_js_bg.wasm}` (~810 KB total).
- `play.html` : nouveau `<script type="module">` qui importe `init` et
  expose `window.rosu` + `window.rosuReady` (Promise). L'init WASM tourne
  en parallèle du bootstrap engine donc est prête bien avant la fin du
  morceau. Catch propre → `window.rosu = null` si .wasm 404 (CSP, offline).
- `pp.js` : nouveau `tryRosu(track, opts)` synchrone — parse `track.track`
  (texte .osu brut conservé par osu.js), cache la `Beatmap` parsée sur
  `track._rosuMap` (réutilisée en cas de retry), construit `Difficulty` +
  `Performance` avec `lazer: false` pour matcher osu.ppy.sh ranked,
  retourne `{stars: {aim, speed, total}, pp: {aim, speed, acc, flashlight,
  total}, maxCombo, source: 'rosu-pp-js'}`. Free explicite des handles
  wasm-bindgen (perfAttrs/diffAttrs/perf/diff) à chaque appel.
- `score.js` : essaie `tryRosu` en premier ; si null (WASM pas prête ou
  parse fail), fallback sur le `calculateStars` + `calculatePP` manuel ;
  si même ça échoue, fallback `legacyEstimatePp`. Le label pp affiche
  `· rosu-pp` pour transparence quand la WASM est utilisée. Affiche aussi
  une 4e métrique `fl` dans le breakdown quand FL est activé.
- Validation live sur "Make a Move (Speed Up Ver.) [Expert]" SS-FC :
  - rosu-pp : **184 pp · 5.16★** (82 aim + 36 speed + 59 acc, max combo 246)
  - HD+DT SS-FC : **494 pp · 7.41★** (238/121/116)
  - vs avant manuel : 88 pp · 2.21★ — écart énorme, rosu correspond bien
    aux valeurs officielles d'osu.ppy.sh.
- Validation `die → retry → die` : 2ème mort déclenche correctement le
  menu "dead" + vignette, audio gain à 1, WASM toujours chargée.

### 25 Feb 2026 — Curseur visible + Animation de mort améliorée
- **Curseur** (`scripts/launchgame.js`) : taille bumpée 0.3 → 0.5 (75 → 125 px à
  cursorSize=1.0) + halo additif blanc (`game.cursorGlow`, scale 0.85, alpha
  pulsante 0.28-0.40) layered derrière le sprite. Le curseur disparaissait
  visuellement à cause de la taille trop petite (avant 75 px dont seul un petit
  bullseye central visible) et du `filter: brightness(0.65) blur(0.6px)` du
  `is-dying` qui le rendait quasi invisible pendant la mort.
- **Animation de mort** (`play.html` + `scripts/playback.js`) :
  - Audio : 2-stage decay (1.0 → 0.55 en 0.45 s, puis → 0.15 en 1.4 s),
    gain → 0 sur 1.7 s, pause à 1.9 s.
  - Filtre canvas : `saturate(0.35) brightness(0.55) blur(1.2px)` (vs avant
    0.55/0.65/0.6) + zoom 1.06× + rotation 0.06°.
  - **Nouveau "fade-to-black"** : `#death-fade` z-index 8700, `transition
    opacity 2200ms`, kicks in à 1100 ms après le vignette pour engloutir la
    scène avant le menu (laisse 1 s aux cercles pour tomber visiblement).
  - Menu "dead" timing 1400 ms → 2500 ms pour laisser la fade-to-black finir.
  - Cleanup explicite (`is-dying` / `death-vignette` / `death-fade`) sur retry
    ET quit pour repartir d'un canvas propre.

### 25 Feb 2026 — Cercles tombants + Esc skip animation de mort
- **Cercles tombants** (`scripts/playback.js` ~ligne 1450) : à la mort, on
  snapshot `gamefield.children` (sauf `flashlightMask` et `SliderMesh`) et on
  applique une physique gravitaire :
  - `__fallVx = (rand-0.5)*3.5` (drift horizontal aléatoire)
  - `__fallVy = (rand*1.2)-0.6` (impulsion initiale)
  - `__fallVr = (rand-0.5)*0.12` (vitesse angulaire)
  - Gravité `vy += 2.4` osu px/frame² → atteint le bas du playfield en ≈700 ms
  - Fade-out une fois `y > 400` (sortis du playfield).
  - `self.updateHitObjects = noop` pour empêcher le moteur de despawn / spawn
    pendant la chute (sinon `destroy()` mid-fall = crash visuel).
- **Esc skip** (`scripts/playback.js` ~ligne 320) : si `self.dead && !self.deathMenuShown`,
  Esc clear le `deathMenuTimer`, force `#death-fade.show` (transition 180 ms),
  ramp gain audio à 0 en 150 ms, puis appelle `showDeathMenuNow()` ⇒ menu instantané.
  Refactor de la setTimeout de 2500 ms en méthode `that.showDeathMenuNow` pour
  permettre cette interruption précoce.
- Reset des flags dans le constructeur (`deathMenuShown`, `deathMenuTimer`,
  `fallingObjects`, `showDeathMenuNow`) pour qu'une 2ème mort déclenche
  proprement la cinématique.

## Backlog (P2 restant)
- Hit sounds (whistle / finish / clap par addition set personnalisé).
- ColorOverride par map (couleurs de combo personnalisées).

## Tech stack
- Frontend : Vanilla JS, PIXI.js v6, AMD modules (require.js).
- Backend : Node.js (proxy osu! API).
- Pas de DB pour le jeu lui-même (localforage côté navigateur pour l'historique).

## Integrations
- **osu! API** (OAuth2 client_credentials) — credentials dans
  `/app/backend-node/.env` (`OSU_CLIENT_ID=52326`,
  `OSU_CLIENT_SECRET=lwa0Ovv5GhuOO8L01rpKPqthovA5wSLe6RX2zSD2`).

## Notes pour le prochain agent
- L'utilisateur écrit en **français** — réponds en français.
- Le système de "loose" est **purement basé sur les misses** (pas de drain
  passif) — ne pas le réintroduire.
- `playback.js` est monolithique (~1500 lignes). Toute modification au render
  loop doit éviter de casser les timings de hit detection.
- Test rapide : `https://ongoing-changes-1.preview.emergentagent.com/webosu2/`
  → choisir une beatmap → lire avec autoplay (`Settings → Autoplay`) pour
  vérifier le score / accuracy / sliders.
