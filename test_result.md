#====================================================================================================
# Testing Data — Phase D (pp réaliste) + Animation death
#====================================================================================================

user_problem_statement: |
  Continuer les modifications du moteur webosu2 :
    - Phase D : pp réaliste (formule officielle aim/speed/accuracy séparée)
    - Animation death : vignette rouge + slow-motion à la mort du joueur

backend:
  - task: "OSU API credentials (already configured)"
    implemented: true
    working: true
    file: "/app/backend-node/.env"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "OSU_CLIENT_ID=52326 + OSU_CLIENT_SECRET déjà configurés depuis sessions précédentes."

frontend:
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
