#====================================================================================================
# Testing Data — Solo page background music (osu!-style preview loop)
#====================================================================================================

user_problem_statement: |
  Pour la page Solo, jouer automatiquement la musique (preview audio) du
  beatmap sélectionné en boucle, comme le vrai jeu en song-select. Démarre
  dès l'arrivée sur Solo, s'arrête quand on quitte Solo.
  Précédemment : modification du contour blanc curseur in-game + masquage
  curseur Windows.

backend:
  - task: "OSU API credentials + node_modules backend-node"
    implemented: true
    working: true
    file: "/app/backend-node/.env, /app/backend-node/node_modules"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Fix 502 : (1) `yarn install` dans /app/backend-node (node_modules
          manquait → 'Cannot find module express') ; (2) recréation du
          fichier .env avec OSU_CLIENT_ID=52326 + OSU_CLIENT_SECRET (donné
          par l'utilisateur). /api/health, /api/beatmaps/popular|new|random
          retournent tous 200.

frontend:
      - working: true
        agent: "main"
        comment: |
          Switch du loop "last 30/45 sec" vers le comportement osu!-réel :
          loop sur `[PreviewTime, end-of-track]` où `PreviewTime` vient
          du `[General].PreviewTime` du fichier `.osu` (ms). C'est le
          moment "intéressant" choisi par le mapper (drop / kiai / chorus).

          1) `lib/beatmapAudio.js` :
             • `parseGeneralSection()` extrait `AudioFilename` ET `PreviewTime`
               via regex sur le .osu (premier diff trouvé, tous les diffs
               d'un set partagent la même valeur en pratique).
             • `fetchBeatmapAudio()` retourne désormais `{ url, previewTimeMs }`
               au lieu d'une simple URL.
             • IDB stocke `{ blob, previewTimeMs }` (avec backwards-compat
               pour les anciennes entrées Blob seul → previewTimeMs=0).

          2) `AudioPlayerContext.js` :
             • Nouvelle ref `previewStartRef` pour le PreviewTime en secondes.
             • `computeLast30Start()` priorise PreviewTime si valide
               (>0 et <duration-1s) ; sinon fallback `duration - 45s`.
             • `playLast30(url, beatmap, { previewTimeMs })` accepte le
               PreviewTime en option.
             • `LOOP_WINDOW_SECONDS = 45` reste comme fallback de sécurité.

          3) `SoloPage.js` : récupère `{ url, previewTimeMs }` et le passe à
             `playLast30()`.

          Vérifié in-browser sur set 320118 (Reol — No title, mappé par VINXIS) :
            • IDB après fetch : `{ blob, previewTimeMs: 50097 }` ✅
            • duration: 91.45s, fenêtre théorique [50.097, 91.45]
            • Échantillons currentTime : 67.72→72.73→77.74→82.76→87.69
              puis WRAP → 51.15 → 56.20 ← reboucle à PreviewTime, pas à 0.
            • Comportement strictement identique à osu! song-select.

  - task: "Musique du beatmap sélectionné — full track + loop sur les 30 dernières secondes (Solo)"
    implemented: true
    working: true
    file: "/app/frontend/src/lib/beatmapAudio.js, /app/frontend/src/contexts/AudioPlayerContext.js, /app/frontend/src/pages/SoloPage.js, /app/frontend/package.json (jszip)"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Remplacement du preview ~10s par la vraie musique du beatmap, en
          boucle sur les 30 dernières secondes (style menu osu! réel).
          1) `yarn add jszip` — pour unzip les .osz côté React.
          2) `src/lib/beatmapAudio.js` :
             • `fetchBeatmapAudio(setId)` télécharge le .osz depuis NeriNyan
               (`api.nerinyan.moe/d/{id}`, CORS-friendly), parse le `.osu`
               pour récupérer `[General].AudioFilename`, extrait l'audio,
               retourne un blob URL avec MIME approprié.
             • Cache à 2 niveaux : Map mémoire + IndexedDB persistante (la
               2ème sélection est instantanée, même après reload).
             • Coalescing des fetches concurrents.
             • Hard cap 60 MB pour éviter les marathons monstrueux.
             • Tracking de progression via `onProgress(0..1)`.
          3) `AudioPlayerContext.js` — nouveau mode "last30" :
             • `playLast30(audioUrl, beatmap)` exposé via le context.
             • `modeRef` (ref) pour suivre 'preview' vs 'last30'.
             • Sur `loadedmetadata` en last30 → seek à `duration - 30`.
             • `audio.loop = false` (loop manuel via onEnded → reseek à
               duration-30 puis play).
             • `timeupdate` enforce la fenêtre : si currentTime tombe avant
               duration-30, on yank back. Et progress reflète 0→1 sur la
               fenêtre 30s, pas sur le morceau entier.
             • Mode "preview" inchangé pour Library/BeatmapDetail/MiniPlayer.
          4) `SoloPage.js` :
             • Utilise `fetchBeatmapAudio(setId)` à chaque sélection.
             • Pendant le DL (1ère fois, 3-15s), joue le preview ~10s comme
               bridge audio (sauf si déjà cached → skip pour pas faire pop
               le preview avant le full track).
             • `fetchTokenRef` invalide les fetches obsolètes (clic rapide
               sur une autre map pendant qu'une autre télécharge).
             • Fallback gracieux si fetch échoue (offline, .osz trop gros,
               AudioFilename absent) → reste sur le preview.
          Tests in-browser sur set 320118 ("No title" / Reol, 1:31) :
            • Download NeriNyan : `https://api.nerinyan.moe/d/320118` →
              redirect 302 vers `dl.nerinyan.moe/v2/d/320118`.
            • À t=25s : srcType=BLOB ✅, duration=91.45s ✅, currentTime=
              82.03s (dans [61.45, 91.45]) ✅.
            • À t=40s : currentTime=67.1s ✅ (a rebouclé 91→61 puis monté
              à 67) — verification : InWindow=True.
            • paused=False, error=None pendant toute la session.

  - task: "Lecture auto + boucle du preview audio sur la page Solo"
    implemented: true
    working: true
    file: "/app/frontend/src/contexts/AudioPlayerContext.js, /app/frontend/src/pages/SoloPage.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          1) AudioPlayerContext.js — `audio.loop = true` à la création de
             l'élément Audio. Le preview officiel osu! (~10 s, b.ppy.sh/
             preview/{id}.mp3, position du preview point) reboucle ainsi
             indéfiniment, reproduisant le song-select du vrai jeu.
          2) AudioPlayerContext.js — `stop()` ne fait plus `audio.src = ""`
             (qui mettait l'élément dans un état dégradé) ; on pause +
             currentTime=0 uniquement. Le prochain play() réécrit src.
          3) SoloPage.js — `useAudioPlayer` expose `play` (pas `toggle`).
             Le restore localStorage appelle `handleSelect(bm)` SANS le flag
             `silent` ; `handleSelect` appelle `play(bm)` dès qu'audio_url
             est présent → musique auto à l'arrivée sur Solo.
          4) SoloPage.js — useEffect cleanup `stop()` au démontage : musique
             scopée à Solo uniquement (Solo→Library/menu/play arrête,
             retour sur Solo relance).
          Tests in-browser : preview en boucle confirmé (loop=true,
          currentTime cycle 0→10), arrêt en quittant, reprise au retour.

  - task: "Curseur in-game sans halo blanc + curseur Windows masqué partout"
    implemented: true
    working: true
    file: "/app/frontend/public/webosu2/scripts/launchgame.js, /app/frontend/public/webosu2/play.html"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          1) launchgame.js — suppression du sprite `cursorGlow` (halo blanc
             additif scale 0.3 alpha 0.22 BLEND_MODES.ADD) qui produisait le
             "contour blanc" autour du curseur in-game. On garde uniquement
             le sprite cursor.png à scale 0.192 (48 px), strictement identique
             au curseur du menu. game.cursorGlow est explicitement mis à null
             pour que les protections `if (game.cursorGlow)` du gameLoop et
             du quitGame restent cohérentes.
          2) launchgame.js — branche `else if (game.showhwmouse)` retirée :
             en jeu (hors autoplay/autopilot), on force toujours la classe
             `shownomouse` sur #game-area, peu importe le réglage utilisateur.
             Le PIXI cursor est l'unique curseur visible.
          3) play.html — ajout de règles CSS inline (main.css n'est pas chargé
             dans play.html → la règle `cursor: none` du shownomouse n'avait
             aucun effet auparavant) :
                #game-area, #game-area > canvas,
                #game-area.shownomouse, #game-area.shownomouse > canvas {
                    cursor: none !important;
                }
             Ciblé uniquement sur #game-area + canvas direct → les overlays
             pause/death/results (au niveau body, z-index élevé) gardent leur
             `cursor: pointer` pour les boutons cliquables.
          Test live in-browser sur sid=765778&bid=1610022 :
            • gaCursor='none', canvasCursor='none' (curseur Windows masqué).
            • gaClasses='game-area shownomouse' (forcé peu importe settings).
            • hasPixiCursor=true, cursorGlow=null (halo supprimé).
            • Screenshot intro confirme : sprite cursor osu rose net, sans
              halo blanc additif autour, identique au curseur du menu.

  - task: "Phase D — pp réaliste (rewrite scripts/overlay/pp.js)"
    implemented: true
    working: true
    file: "/app/frontend/public/webosu2/scripts/overlay/pp.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Bug critique corrigé : pp.js exportait `calculateMaxCombo` qui n'était
          jamais défini → ReferenceError au chargement → score.js retombait
          systématiquement sur l'estimateur léger `legacyEstimatePp`.
          Réécriture complète de pp.js structurellement osu!stable :
            • calculateMaxCombo(track) : somme combo réelle (head + ticks + repeats
              par slider, +1 par circle/spinner). Estime les ticks via beat /
              tickRate quand les sliders n'ont pas encore été instanciés par
              playback.createSlider.
            • calculateStars : strain à décroissance exponentielle (aim 750ms,
              speed 350ms) bucketé en sections de 400ms (peaks osu!stable).
              Aim inclut vélocité + bonus angle + bonus jump distance + slider
              velocity. Speed inclut tap rate + pénalité doubletap. Combinaison
              top peaks pondérée 0.9^i puis L^1.1.
            • calculatePP : aim/speed/acc séparés avec length bonus, miss penalty
              (0.97^miss), combo scaling ((combo/max)^0.8), AR factor (>10.33
              ou <8), HD/FL/NF multipliers, AR/OD effectifs après DT/HT.
              Combinaison L^1.1 + global multiplier 1.12. RL/AP/AT → 0 pp.
            • score.js mis à jour pour utiliser calculateMaxCombo(track) quand
              track.maxCombo manque (au lieu du fallback hit-count brut).
          Test live in-browser :
            • Synthetic 60-circles map : maxCombo=60, stars=0.43★, ppFC=39pp,
              pp95=11pp, ppDT=83pp (échelle plausible).
            • Real map "Make a Move (Speed Up Ver.) [Expert]" 174 hit-objects
              OD8.7/AR9/CS3.8 : SS-FC affiche 88 pp (17 aim + 0 speed + 65 acc)
              avec ★2.21 dans l'UI results — décomposition aim/speed/acc visible.

  - task: "Animation death (vignette rouge + slow-motion + tint lerp)"
    implemented: true
    working: true
    file: "/app/frontend/public/webosu2/scripts/playback.js, /app/frontend/public/webosu2/play.html, /app/frontend/public/webosu2/scripts/overlay/score.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          1) play.html : nouveau CSS #death-vignette (radial gradient rouge +
             ::before pulse animé) et #game-area.is-dying canvas (filter
             saturate/brightness/blur/hue-rotate + zoom subtil sur 1500ms).
          2) playback.js (branche HP < 0, !nofail) :
             a) Audio : cancelScheduledValues + linearRampToValueAtTime sur
                playbackRate (1.0→0.35 sur 0.9s) + gain (1→0 sur 1.05s),
                puis audio.pause() à T+1200ms (slow-mo + fade-out).
             b) Injecte <div id="death-vignette"> dans <body>, force reflow
                puis requestAnimationFrame(() => addClass('show')) pour que
                l'opacity transition se déclenche correctement.
             c) Lerp smooth background.tint vers 0x331111 sur 1500ms via RAF
                (avec fallback Date.now() si performance.now() absent).
             d) showDeathMenu() retardé de 1400ms (au lieu d'immédiatement)
                pour laisser la slow-mo se résoudre avant le pop du menu.
          3) score.js (showDeathMenu cleanup) : retire .is-dying du #game-area
             et supprime #death-vignette du DOM avant de relancer retry/quit.
          Test live in-browser sur sid=765778&bid=1610022 (Make a Move Expert) :
            • HP forcé à -1 → vignette rouge fade-in visible à T+0.6s (radial
              gradient + pulse halo central) + slow-mo filter sur le canvas
              (saturate 0.55, brightness 0.65, hue-rotate -8°).
            • Menu "dead" en gradient rouge apparaît à T+1.4s avec boutons
              Retry/Quit.
            • Cleanup vérifié au QUIT : menu_hidden=true, vignette_present=false,
              gamearea_dying=false (toutes les classes/DOM nettoyés).

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 1

test_plan:
  current_focus:
    - "Phase D — pp réaliste (rewrite scripts/overlay/pp.js)"
    - "Animation death (vignette rouge + slow-motion + tint lerp)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Phase D + Animation death implémentées et testées en live browser.

      Phase D (pp réaliste) :
        • Bug ReferenceError dans pp.js corrigé (calculateMaxCombo non défini).
        • Nouveau strain par sections 400ms + aim/speed/acc séparés, mods complets,
          AR/OD effectifs après DT/HT, totalMaxCombo réel calculé.
        • Vérifié sur "Make a Move (Speed Up Ver.) [Expert]" : SS-FC → 88 pp
          (17 aim + 0 speed + 65 acc) avec décomposition visible dans le results
          screen, ★2.21 affiché, totalMaxCombo=174.

      Animation death :
        • Vignette rouge fade-in 1.1s + filter slow-mo (saturate/brightness/blur)
          + audio playbackRate ramp 1→0.35 + gain ramp 1→0 + tint lerp PIXI.
        • Menu "dead" retardé de 1.4s pour laisser la slow-mo respirer.
        • Cleanup propre au retry/quit (CSS classes retirées, DOM nettoyé).

      Aucune régression observée sur le flow normal de jeu (autoplay + skip
      intro fonctionnent toujours, modules pp/score chargent sans erreur).
