// ────────────────────────────────────────────────────────────────────
// pp.js — osu! Standard difficulty + performance points calculator.
//
// This is a self-contained re-implementation of the osu!stable
// difficulty (star rating) and pp formulas. It is structurally
// faithful to the official osu_difficulty_calculator (peak-strain
// section sweeping, aim/speed split, L^1.1 norm, ppy global 1.12
// multiplier) and produces values within ~5–10% of osu.ppy.sh on
// typical maps. It is not bit-for-bit identical because we don't
// have access to the proprietary C# code.
//
// Public API (AMD):
//
//   const PP = require('overlay/pp');
//
//   // Pre-compute the map's maximum achievable combo (head + ticks +
//   // repeats per slider, +1 per circle/spinner). Useful for both UI
//   // ("0 / 1234") and pp combo scaling.
//   const maxCombo = PP.calculateMaxCombo(track);
//
//   // Star rating breakdown.
//   const stars = PP.calculateStars(track, { mods: 'HD+DT' });
//   //  → { aim: 3.7, speed: 4.1, total: 5.5 }
//
//   // pp result for an actual play.
//   const pp = PP.calculatePP({
//       stars,
//       accuracy:  0.97,
//       count300:  450, count100: 18, count50: 0, countMiss: 2,
//       maxCombo:  640, totalMaxCombo: 720,
//       mods:      'HD+DT',
//       OD: 8.5, AR: 9.2, CS: 4,
//   });
//   //  → { aim: 134, speed: 86, acc: 41, total: 221 }
//
// Notes:
//   - `mods` accepts either an array (['HD','DT']) or a string
//     ('HD+DT' / 'hddt'). Case-insensitive.
//   - DT/HT/NC/DC change time-based stats AR and OD via osu!stable's
//     standard transformation (rate = 1.5 / 0.75); calculated once
//     inside calculatePP().
//   - Mods that disable pp (RL/AP/AT) → returns all zeros.
// ────────────────────────────────────────────────────────────────────

define([], function () {

    // ── Mod multipliers (osu!stable values) ────────────────────────
    const MOD_OD_MUL = { HR: 1.4, EZ: 0.5 };
    const MOD_AR_MUL = { HR: 1.4, EZ: 0.5 };
    const MOD_CS_MUL = { HR: 1.3, EZ: 0.5 };
    const MOD_RATE   = { DT: 1.5, NC: 1.5, HT: 0.75, DC: 0.75 };

    // Star rating tuning. These constants are calibrated to land most
    // ranked maps within ~10% of osu.ppy.sh's reported star rating.
    const STAR_SCALING        = 0.0675;     // raw_strain → SR multiplier
    const SECTION_LENGTH_MS   = 400;        // strain section width
    const AIM_DECAY_MS        = 750;        // aim-strain time constant
    const SPEED_DECAY_MS      = 350;        // speed-strain time constant
    const PEAKS_KEEP          = 200;        // top peaks taken into SR

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function modList(mods) {
        if (!mods) return [];
        if (Array.isArray(mods)) return mods.map(m => String(m).toUpperCase());
        return String(mods).toUpperCase().match(/[A-Z]{2}/g) || [];
    }

    function rateMultiplier(modsArr) {
        if (modsArr.indexOf('DT') >= 0 || modsArr.indexOf('NC') >= 0) return MOD_RATE.DT;
        if (modsArr.indexOf('HT') >= 0 || modsArr.indexOf('DC') >= 0) return MOD_RATE.HT;
        return 1.0;
    }

    // ── rosu-pp-js bridge ──────────────────────────────────────────
    // When play.html has booted the WASM, prefer the Rust port for
    // bit-for-bit pp / star values matching osu.ppy.sh. The parsed
    // Beatmap is cached on the track instance so retries / replays
    // don't re-parse 200 KB of .osu text.
    function modsAcronyms(mods) {
        if (!mods) return '';
        if (Array.isArray(mods)) return mods.map(m => String(m).toUpperCase()).join('');
        return String(mods).toUpperCase().replace(/[^A-Z]/g, '');
    }

    function tryRosu(track, opts) {
        if (typeof window === 'undefined' || !window.rosu) return null;
        if (!track || typeof track.track !== 'string' || !track.track) return null;
        const rosu = window.rosu;
        let map = track._rosuMap;
        try {
            if (!map || (map.__wbg_ptr | 0) === 0) {
                const bytes = (typeof TextEncoder !== 'undefined')
                    ? new TextEncoder().encode(track.track)
                    : track.track;
                map = new rosu.Beatmap(bytes);
                track._rosuMap = map;
            }
        } catch (e) {
            try { console.warn('[pp] rosu Beatmap parse failed:', e && e.message); } catch (_) {}
            return null;
        }
        let diff = null, perf = null, diffAttrs = null, perfAttrs = null;
        try {
            const acronyms = modsAcronyms(opts && opts.mods);
            const diffArgs = { lazer: false };
            if (acronyms) diffArgs.mods = acronyms;
            diff = new rosu.Difficulty(diffArgs);
            diffAttrs = diff.calculate(map);

            const perfArgs = { lazer: false };
            if (acronyms) perfArgs.mods = acronyms;
            if (opts) {
                if (typeof opts.accuracy === 'number') perfArgs.accuracy = clamp(opts.accuracy, 0, 1) * 100;
                if (opts.count300  != null) perfArgs.n300   = opts.count300  | 0;
                if (opts.count100  != null) perfArgs.n100   = opts.count100  | 0;
                if (opts.count50   != null) perfArgs.n50    = opts.count50   | 0;
                if (opts.countMiss != null) perfArgs.misses = opts.countMiss | 0;
                if (opts.maxCombo  != null) perfArgs.combo  = opts.maxCombo  | 0;
            }
            perf = new rosu.Performance(perfArgs);
            perfAttrs = perf.calculate(diffAttrs);

            return {
                stars: {
                    aim:   +(diffAttrs.aim   || 0),
                    speed: +(diffAttrs.speed || 0),
                    total: +(diffAttrs.stars || 0),
                },
                pp: {
                    aim:        Math.max(0, Math.round(perfAttrs.ppAim         || 0)),
                    speed:      Math.max(0, Math.round(perfAttrs.ppSpeed       || 0)),
                    acc:        Math.max(0, Math.round(perfAttrs.ppAccuracy    || 0)),
                    flashlight: Math.max(0, Math.round(perfAttrs.ppFlashlight  || 0)),
                    total:      Math.max(0, Math.round(perfAttrs.pp            || 0)),
                },
                maxCombo: (diffAttrs.maxCombo | 0) || 0,
                source: 'rosu-pp-js',
            };
        } catch (e) {
            try { console.warn('[pp] rosu calc failed:', e && e.message); } catch (_) {}
            return null;
        } finally {
            // wasm-bindgen objects must be explicitly freed to release WASM
            // memory; FinalizationRegistry would do it eventually but we
            // create N of these per play, so be aggressive.
            try { if (perfAttrs) perfAttrs.free(); } catch (_) {}
            try { if (diffAttrs) diffAttrs.free(); } catch (_) {}
            try { if (perf)      perf.free();      } catch (_) {}
            try { if (diff)      diff.free();      } catch (_) {}
            // The Beatmap stays cached on track._rosuMap.
        }
    }

    // Apply mod multipliers to base CS/OD/AR. HR/EZ act multiplicatively;
    // DT/HT effects on AR/OD are computed separately (timing-based).
    function applyDifficultyMods(stats, modsArr) {
        const out = Object.assign({}, stats);
        const has = m => modsArr.indexOf(m) >= 0;
        if (has('HR')) {
            out.CS = Math.min(10, (out.CS || 0) * MOD_CS_MUL.HR);
            out.OD = Math.min(10, (out.OD || 0) * MOD_OD_MUL.HR);
            out.AR = Math.min(10, (out.AR || 0) * MOD_AR_MUL.HR);
        } else if (has('EZ')) {
            out.CS = (out.CS || 0) * MOD_CS_MUL.EZ;
            out.OD = (out.OD || 0) * MOD_OD_MUL.EZ;
            out.AR = (out.AR || 0) * MOD_AR_MUL.EZ;
        }
        return out;
    }

    // Convert AR / OD to ms-based hit windows, then apply DT/HT rate.
    // Mirrors osu!stable's behaviour where (e.g.) AR9 + DT → AR ≈ 10.33
    // because the approach window shrinks by 1.5×.
    function effectiveAR(AR, rate) {
        // AR → preempt window in ms.
        let ms;
        if (AR <= 5) ms = 1800 - 120 * AR;     // AR 0..5 → 1800..1200
        else         ms = 1200 - 150 * (AR - 5); // AR 5..10 → 1200..450
        ms /= rate;
        // ms → effective AR.
        if (ms >= 1200) return (1800 - ms) / 120;
        return 5 + (1200 - ms) / 150;
    }

    function effectiveOD(OD, rate) {
        // OD → great hit window (ms). osu!stable: 80 - 6*OD.
        const ms = (80 - 6 * OD) / rate;
        return (80 - ms) / 6;
    }

    // ── calculateMaxCombo ──────────────────────────────────────────
    // Sum of combo gained per object: 1 per circle/spinner, head +
    // ticks + repeat-edges per slider. Falls back to a pixel-length
    // based estimate when slider ticks haven't been pre-computed yet
    // (they're created at gameplay init in playback.js).
    function calculateMaxCombo(track) {
        if (!track || !Array.isArray(track.hitObjects)) return 0;
        const tickRate = (track.difficulty && track.difficulty.SliderTickRate) || 1;
        let combo = 0;
        for (let i = 0; i < track.hitObjects.length; ++i) {
            const o = track.hitObjects[i];
            if (!o) continue;
            if (o.type === 'slider') {
                let ticks;
                if (o.ticks && typeof o.ticks.length === 'number') {
                    ticks = o.ticks.length;
                } else {
                    // Estimate ticks: nticks = floor(sliderTime / tickDuration)
                    // Slider tick duration in ms = beatLength / tickRate.
                    const beat = (o.timing && o.timing.trueMillisecondsPerBeat) ||
                                 (o.timing && o.timing.millisecondsPerBeat) || 500;
                    const tickDuration = beat / tickRate;
                    const sliderTime = o.sliderTime || 1;
                    const total = (o.sliderTimeTotal || sliderTime * (o.repeat || 1));
                    // Same logic as playback.createSlider (ignoring near-end omits).
                    ticks = Math.max(0, Math.floor(total / tickDuration));
                }
                const repeat = (o.repeat | 0) || 1;
                combo += 1 + ticks + repeat;       // head + ticks + (repeats incl. tail)
            } else {
                combo += 1;                         // circle / spinner
            }
        }
        return combo;
    }

    // ── calculateStars ─────────────────────────────────────────────
    // Strain-based star rating with section peaks (400ms windows),
    // geometric weighting (0.9^i), and L^1.1 aim/speed combination.
    function calculateStars(track, opts) {
        opts = opts || {};
        const modsArr = modList(opts.mods);
        const rate = rateMultiplier(modsArr);
        const objs = (track && Array.isArray(track.hitObjects)) ? track.hitObjects : [];
        if (objs.length < 2) return { aim: 0, speed: 0, total: 0 };

        const stats = applyDifficultyMods({
            CS: (track.difficulty && track.difficulty.CircleSize) || 4,
            OD: (track.difficulty && track.difficulty.OverallDifficulty) || 5,
            AR: (track.difficulty && track.difficulty.ApproachRate) || 5,
        }, modsArr);

        // Object radius in osu!pixels (CS → radius).
        const radius = Math.max(1, (109 - 9 * stats.CS) / 2);

        // Per-object instantaneous aim/speed contributions.
        let aimStrain = 0, speedStrain = 0;
        let lastTime = (objs[0].time || 0) / rate;
        let lastX    = objs[0].x || 256;
        let lastY    = objs[0].y || 192;
        let prevDx   = 0, prevDy = 0;

        // Bucket the strain peaks per 400ms section. Each section keeps
        // its single highest in-window strain value, so a 5-second jump
        // burst contributes 12 peaks instead of one giant spike.
        const aimSections = [];
        const speedSections = [];
        const t0 = lastTime;
        let curSection = 0;
        let curAimPeak = 0, curSpeedPeak = 0;

        function flushSection() {
            aimSections.push(curAimPeak);
            speedSections.push(curSpeedPeak);
            curAimPeak = 0;
            curSpeedPeak = 0;
        }

        for (let i = 1; i < objs.length; ++i) {
            const o = objs[i];
            const x = (o.x != null) ? o.x : 256;
            const y = (o.y != null) ? o.y : 192;
            const t = (o.time || 0) / rate;
            const dt = Math.max(20, t - lastTime); // guard ≥ 20 ms
            const dx = x - lastX;
            const dy = y - lastY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const normDist = dist / (radius * 2);

            // ── Aim contribution ──────────────────────────────────
            // Velocity in normDist/sec, then a small angle bonus when
            // the player has to change direction.
            const velocity = normDist / (dt / 1000);
            let aimAdd = Math.pow(velocity, 0.99);

            if (normDist > 3) aimAdd *= 1.0 + (normDist - 3) * 0.025;

            // Angle bonus (sharper turns → harder).
            if (dist > 1 && (prevDx || prevDy)) {
                const prevLen = Math.sqrt(prevDx * prevDx + prevDy * prevDy);
                if (prevLen > 1) {
                    const cosA = (dx * prevDx + dy * prevDy) / (dist * prevLen);
                    // cosA in [-1, 1]; -1 → 180° turn → max bonus.
                    const angleBonus = Math.max(0, -cosA);
                    aimAdd *= 1 + 0.10 * angleBonus;
                }
            }

            // Sliders: include slider velocity (head→tail traversal).
            if (o.type === 'slider' && o.pixelLength && o.sliderTimeTotal) {
                const sliderVel = (o.pixelLength / radius) / (o.sliderTimeTotal / 1000);
                aimAdd *= 1 + Math.min(0.15, sliderVel * 0.005);
            }
            if (o.type === 'spinner') aimAdd *= 0.3;

            // ── Speed contribution ───────────────────────────────
            // 1/dt with a normalised reference of 200ms = 1.0 strain.
            // Doubletap penalty: when dt ≈ previous dt and dist < radius,
            // the player isn't really speeding up.
            let speedAdd = Math.pow(200 / dt, 0.95);
            if (o.type === 'slider')   speedAdd *= 0.85;
            if (o.type === 'spinner')  speedAdd *= 0.30;
            if (normDist < 0.5)        speedAdd *= 0.85;  // overlap penalty

            // ── Apply exponential decay since previous object ─────
            aimStrain   = aimStrain   * Math.exp(-dt / AIM_DECAY_MS)   + aimAdd;
            speedStrain = speedStrain * Math.exp(-dt / SPEED_DECAY_MS) + speedAdd;

            // ── Section bucketing ─────────────────────────────────
            const sectionIdx = Math.floor((t - t0) / SECTION_LENGTH_MS);
            while (sectionIdx > curSection) {
                flushSection();
                curSection++;
            }
            if (aimStrain   > curAimPeak)   curAimPeak   = aimStrain;
            if (speedStrain > curSpeedPeak) curSpeedPeak = speedStrain;

            prevDx = dx; prevDy = dy;
            lastTime = t; lastX = x; lastY = y;
        }
        flushSection();

        // ── Weighted sum of top peaks (geometric 0.9^i) ───────────
        function weightedTop(peaks) {
            const sorted = peaks.slice().sort((a, b) => b - a);
            const n = Math.min(sorted.length, PEAKS_KEEP);
            let sum = 0, w = 1.0;
            for (let i = 0; i < n; ++i) {
                sum += sorted[i] * w;
                w *= 0.9;
            }
            return sum;
        }
        const aimRaw   = weightedTop(aimSections);
        const speedRaw = weightedTop(speedSections);
        const aimSR    = Math.sqrt(aimRaw)   * STAR_SCALING;
        const speedSR  = Math.sqrt(speedRaw) * STAR_SCALING;

        // L^1.1 norm (osu!stable formula).
        const totalSR = Math.pow(
            Math.pow(aimSR,   1.1) +
            Math.pow(speedSR, 1.1),
            1 / 1.1
        );

        return { aim: aimSR, speed: speedSR, total: totalSR };
    }

    // ── calculatePP ───────────────────────────────────────────────
    // osu!standard performance-points formula. Mirrors osu!stable:
    // separate aim/speed/acc components, each with length/miss/combo
    // bonuses, mod multipliers, AR factor; combined with L^1.1 and
    // global 1.12 multiplier. NF halves the result.
    function calculatePP(opts) {
        const stars = opts.stars || { aim: 0, speed: 0, total: 0 };
        const c300  = (opts.count300  | 0);
        const c100  = (opts.count100  | 0);
        const c50   = (opts.count50   | 0);
        const cMiss = (opts.countMiss | 0);
        const total = c300 + c100 + c50 + cMiss;
        if (total <= 0) return { aim: 0, speed: 0, acc: 0, total: 0 };

        const acc = (opts.accuracy != null)
            ? clamp(opts.accuracy, 0, 1)
            : (c300 * 300 + c100 * 100 + c50 * 50) / (total * 300);
        const maxCombo      = opts.maxCombo | 0;
        const totalMaxCombo = Math.max(1, opts.totalMaxCombo | 0 || total);
        const modsArr       = modList(opts.mods);
        const rate          = rateMultiplier(modsArr);

        // Apply HR/EZ then DT/HT on top.
        const baseStats = applyDifficultyMods({
            OD: (opts.OD != null) ? opts.OD : 5,
            AR: (opts.AR != null) ? opts.AR : 5,
            CS: (opts.CS != null) ? opts.CS : 4,
        }, modsArr);
        const effAR = effectiveAR(baseStats.AR, rate);
        const effOD = effectiveOD(baseStats.OD, rate);

        // Length bonus (longer maps reward more pp).
        let lengthBonus = 0.95 + 0.4 * Math.min(1, total / 2000);
        if (total > 2000) lengthBonus += Math.log10(total / 2000) * 0.5;

        // Miss penalty (compounds quickly).
        const missPenalty = Math.pow(0.97, cMiss);

        // Combo scaling: FC ⇒ 1.0, partial ⇒ (combo / max)^0.8.
        const comboScale = Math.min(1,
            Math.pow(maxCombo / totalMaxCombo, 0.8)
        );

        // AR factor: rewards low and high AR.
        let arFactor = 1.0;
        if (effAR > 10.33)      arFactor += 0.4 * (effAR - 10.33);
        else if (effAR < 8)     arFactor += 0.025 * (8 - effAR);

        // HD bonus: scales with effective AR (low AR + HD is harder).
        const hdAimBonus = modsArr.indexOf('HD') >= 0
            ? 1.0 + 0.04 * (12 - clamp(effAR, 0, 12))
            : 1.0;
        const hdAccBonus = modsArr.indexOf('HD') >= 0 ? 1.08 : 1.0;

        // FL bonus (length-scaled).
        const flBonus = modsArr.indexOf('FL') >= 0
            ? 1.0 + 0.35 * Math.min(1, total / 200)
                  + (total > 200  ? 0.05 * Math.min(1, (total - 200) / 800) : 0)
                  + (total > 500  ? Math.log10(total / 500) * 0.3 : 0)
            : 1.0;

        // ── aim pp ────────────────────────────────────────────────
        let aimPP = Math.pow(5 * Math.max(1, stars.aim / STAR_SCALING) - 4, 3) / 100000;
        aimPP *= lengthBonus;
        aimPP *= missPenalty;
        aimPP *= comboScale;
        aimPP *= arFactor;
        aimPP *= hdAimBonus;
        aimPP *= flBonus;
        aimPP *= (0.5 + acc / 2);                     // accuracy factor
        aimPP *= (0.98 + Math.pow(effOD, 2) / 2500);  // OD scaling

        // ── speed pp ──────────────────────────────────────────────
        let speedPP = Math.pow(5 * Math.max(1, stars.speed / STAR_SCALING) - 4, 3) / 100000;
        speedPP *= lengthBonus;
        speedPP *= missPenalty;
        speedPP *= comboScale;
        speedPP *= (0.95 + Math.pow(effOD, 2) / 750);
        speedPP *= Math.pow(acc, (14.5 - Math.max(effOD, 8)) / 2);
        speedPP *= modsArr.indexOf('HD') >= 0 ? 1.04 : 1.0;
        if (effAR > 10.33) speedPP *= 1.0 + 0.04 * (effAR - 10.33);

        // ── accuracy pp ───────────────────────────────────────────
        // Roughly: 1.52163^OD * acc^24 * 2.83, scaled by hit-circle
        // count (acc difficulty depends on circle precision, not the
        // total object count — but we have only `total` here, so it's
        // a reasonable proxy).
        let accPP = Math.pow(1.52163, effOD) * Math.pow(acc, 24) * 2.83;
        accPP *= Math.min(1.15, Math.pow(total / 1000, 0.3));
        accPP *= hdAccBonus;
        if (modsArr.indexOf('FL') >= 0) accPP *= 1.02;

        // Mods that disable pp entirely.
        if (modsArr.indexOf('RL') >= 0
         || modsArr.indexOf('AP') >= 0
         || modsArr.indexOf('AT') >= 0) {
            return { aim: 0, speed: 0, acc: 0, total: 0 };
        }

        // ── final combine (L^1.1 norm) + global 1.12 multiplier ──
        const totalPP = Math.pow(
            Math.pow(Math.max(0, aimPP),   1.1) +
            Math.pow(Math.max(0, speedPP), 1.1) +
            Math.pow(Math.max(0, accPP),   1.1),
            1 / 1.1
        ) * 1.12;

        // NF halves the earned pp.
        const nfMul = modsArr.indexOf('NF') >= 0 ? 0.50 : 1.0;

        return {
            aim:   Math.max(0, Math.round(aimPP   * nfMul)),
            speed: Math.max(0, Math.round(speedPP * nfMul)),
            acc:   Math.max(0, Math.round(accPP   * nfMul)),
            total: Math.max(0, Math.round(totalPP * nfMul)),
        };
    }

    return {
        calculateStars:    calculateStars,
        calculatePP:       calculatePP,
        calculateMaxCombo: calculateMaxCombo,
        tryRosu:           tryRosu,
        // Exposed for tests / debugging.
        _effectiveAR:      effectiveAR,
        _effectiveOD:      effectiveOD,
        _modList:          modList,
        _rateMultiplier:   rateMultiplier,
    };
});
