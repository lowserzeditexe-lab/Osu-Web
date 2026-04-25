/*
* class: ScoreOverlay (extends PIXI.Container)
* responsible for calculating & displaying combo, score, HP, accuracy...
* 
* Construct params
*   gamefield: {width, height} in real pixels
*
* properties
*   tint: 24-bit integer color of display
*   
*/

define(['overlay/pp'], function (PP) {
    function addPlayHistory(summary) {
        if (!window.playHistory1000) {
            window.playHistory1000 = [];
        }
        window.playHistory1000.push(summary);
        if (window.playHistory1000.length > 1000)
            window.playHistory1000.shift();
        // save history
        if (window.localforage) {
            localforage.setItem("playhistory1000", window.playHistory1000, function (err, val) {
                if (err) {
                    console.error("Error saving play history");
                }
            });
        }
    }

    function grade(acc) {
        if (acc >= 1) return 'SS';
        if (acc >= 0.95) return 'S';
        if (acc >= 0.9) return 'A';
        if (acc >= 0.8) return 'B';
        if (acc >= 0.7) return 'C';
        return 'D';
    }

    class LazyNumber {
        constructor(value = 0) {
            this.value = value;
            this.target = value;
            this.lasttime = -1000000; // playback can start before time=0
        }
        static get lag() { return 200; }
        update(time) {
            this.value += (this.target - this.value) * (1 - Math.exp((this.lasttime - time) / LazyNumber.lag));
            this.lasttime = time;
        }
        set(time, value) {
            this.update(time);
            this.target = value;
        }
        valueAt(time) {
            this.update(time);
            return this.value;
        }
    }

    class ScoreOverlay extends PIXI.Container {
        constructor(windowfield, HPdrain, scoreMultiplier, difficultyMultiplier, track) {
            super();
            this.field = windowfield;
            this.HPdrain = HPdrain;
            this.scaleMul = windowfield.height / 800;
            this.scoreMultiplier = scoreMultiplier;
            // Beatmap reference (optional) — used for true pp computation
            // at the end of the play. Falls back to the legacy estimator
            // when not provided so older call sites don't break.
            this.track = track || null;
            // osu!stable difficulty multiplier (2..6) baked from HP+CS+OD by the
            // caller; defaults to 2 if not provided so we never blow up older
            // call sites.
            this.difficultyMultiplier = (typeof difficultyMultiplier === 'number' && difficultyMultiplier > 0) ? difficultyMultiplier : 2;
            // Tracking spacing between digits (used by setSpriteArrayText/Pos).
            this.charspacing = 0;

            this.score = 0; // already multiplied by scoreMultiplier
            this.combo = 0;
            this.maxcombo = 0;
            this.judgeTotal = 0;
            this.maxJudgeTotal = 0;
            this.HP = 1;
            this.fullcombo = true;
            // accuracy = judgeTotal / maxJudgeTotal
            this.onfail = null;
            this.judgecnt = {
                great: 0,
                good: 0,
                meh: 0,
                miss: 0,
            };

            this.score4display = new LazyNumber(this.score);
            this.combo4display = new LazyNumber(this.combo);
            this.accuracy4display = new LazyNumber(1);
            this.HP4display = new LazyNumber(this.HP);

            // Utility to create sprite arrays
            this.scoreDigits = this.newSpriteArray(10, 0.4, 0xddffff); // 9999999999
            this.comboDigits = this.newSpriteArray(6, 0.2, 0xddffff);   // 99999x
            this.accuracyDigits = this.newSpriteArray(7, 0.2, 0xddffff); // 100.00%
            this.HPbar = this.newSpriteArray(3, 0.5);
            this.HPbar[0].texture = Skin["hpbarleft.png"];
            this.HPbar[1].texture = Skin["hpbarright.png"];
            this.HPbar[2].texture = Skin["hpbarmid.png"];
            this.HPbar[0].anchor.x = 1;
            this.HPbar[0].scale.x = this.field.width / 500;
            this.HPbar[1].scale.x = this.field.width / 500;
            this.HPbar[0].y = -7 * this.scaleMul;
            this.HPbar[1].y = -7 * this.scaleMul;
            this.HPbar[2].y = -7 * this.scaleMul;
        }

        newSpriteArray(len, scaleMul = 1, tint = 0xffffff) {
            let a = new Array(len);
            for (let i = 0; i < len; ++i) {
                a[i] = new PIXI.Sprite();
                a[i].scale.x = a[i].scale.y = this.scaleMul * scaleMul;
                a[i].anchor.set(0, 0);
                a[i].alpha = 1;
                a[i].tint = tint;
                this.addChild(a[i]);
            }
            return a;
        }

        resize(windowfield) {
            this.field = windowfield;
            this.scaleMul = windowfield.height / 800;
            const f = (arr, mul) => {
                arr.forEach(sprite => { sprite.scale.x = sprite.scale.y = mul; });
            };
            f(this.scoreDigits, this.scaleMul * 0.4);
            f(this.comboDigits, this.scaleMul * 0.2);
            f(this.accuracyDigits, this.scaleMul * 0.2);
            f(this.HPbar, this.scaleMul * 0.5);
            this.HPbar[0].scale.x = this.field.width / 500;
            this.HPbar[1].scale.x = this.field.width / 500;
            this.HPbar[0].y = -7 * this.scaleMul;
            this.HPbar[1].y = -7 * this.scaleMul;
            this.HPbar[2].y = -7 * this.scaleMul;
        }

        HPincreasefor(result) {
            switch (result) {
                case 0:
                    return -0.02 * this.HPdrain;
                case 50:
                    return 0.01 * (4 - this.HPdrain);
                case 100:
                    return 0.01 * (8 - this.HPdrain);
                case 300:
                    return 0.01 * (10.2 - this.HPdrain);
                default:
                    return 0;
            }
        }

        // ── Slider component scoring (osu!stable) ────────────────────
        // Per the wiki, slider ticks/repeats/ends contribute *score points*
        // and combo, but NOT accuracy — accuracy is computed once per hit
        // object using the slider's overall final judgement (300/100/50/0
        // depending on the % of components hit, see commitAccuracy()).
        // This helper updates score, combo and HP only; it does NOT touch
        // judgeTotal / maxJudgeTotal / judgecnt.
        // - On hit: tiny HP heal (about 1/4 of a 300 hit) per the user's
        //   "HP only changes on hit/miss" rule.
        // - On miss: combo break + half-miss HP loss. The optional 4th
        //   argument `breakCombo` lets the slider end opt out of the
        //   combo break (per osu!stable: missing the very last slider end
        //   forfeits the points but does NOT break combo).
        hitTick(score, time, breakCombo) {
            if (typeof breakCombo === 'undefined') breakCombo = true;
            this.score += score * (
                1 + (Math.max(0, this.combo) * this.difficultyMultiplier * this.scoreMultiplier) / 25
            );
            const oldCombo = this.combo;
            if (score > 0) {
                this.combo = this.combo + 1;
                // Tiny HP heal on tick / slider-edge hit, ~1/4 of a 300 hit.
                if (this.HP >= 0) this.HP += 0.0025 * (10.2 - this.HPdrain);
                this.HP = Math.min(1, this.HP);
            } else if (breakCombo) {
                this.combo = 0;
                this.fullcombo = false;
                if (oldCombo > 20 && window.game && window.game.sampleComboBreak) {
                    window.game.sampleComboBreak.volume = window.game.masterVolume * window.game.effectVolume;
                    window.game.sampleComboBreak.play();
                }
                if (this.HP >= 0) this.HP -= 0.01 * this.HPdrain; // half-miss HP loss
                this.HP = Math.min(1, this.HP);
                // SD/PF do NOT instafail on slider-tick misses — those are
                // forgiven per osu!stable; instafails happen on the slider's
                // final judgement (handled in commitAccuracy()).
            }
            this.maxcombo = Math.max(this.maxcombo, this.combo);
            this.score4display.set(time, this.score);
            this.combo4display.set(time, this.combo);
            this.HP4display.set(time, Math.max(0, this.HP));
        }

        // ── Final aggregate slider judgement (accuracy only) ────────
        // Called once at the end of every slider with the % of components
        // (head + ticks + repeats + end) successfully hit. Per osu!stable
        // wiki: 100% → 300, ≥50% → 100, >0% → 50, 0% → Miss. Score, combo
        // and HP have already been awarded/penalised through hitTick()
        // during the slider, so this method only contributes accuracy
        // (judgeTotal/maxJudgeTotal/judgecnt) and applies SD/PF instafails.
        commitAccuracy(elementsHit, elementsTotal, time) {
            const ratio = elementsTotal > 0 ? (elementsHit / elementsTotal) : 0;
            let result;
            if (ratio >= 1)        result = 300;
            else if (ratio >= 0.5) result = 100;
            else if (ratio > 0)    result = 50;
            else                   result = 0;

            if (result === 300) this.judgecnt.great++;
            else if (result === 100) this.judgecnt.good++;
            else if (result === 50)  this.judgecnt.meh++;
            else                     this.judgecnt.miss++;

            this.judgeTotal += result;
            this.maxJudgeTotal += 300;

            if (result < 300) this.fullcombo = false;

            // SD / PF instafail on the slider's overall judgement.
            if (window.game) {
                if (window.game.perfect && result < 300) this.HP = -1;
                else if (window.game.sudden && result === 0) this.HP = -1;
            }

            this.accuracy4display.set(time, this.judgeTotal / this.maxJudgeTotal);
            this.HP4display.set(time, Math.max(0, this.HP));
            return result;
        }


        hit(result, maxresult, time) {
            if (maxresult === 300) {
                if (result === 300) this.judgecnt.great++;
                if (result === 100) this.judgecnt.good++;
                if (result === 50) this.judgecnt.meh++;
                if (result === 0) this.judgecnt.miss++;
            }
            this.judgeTotal += result;
            this.maxJudgeTotal += maxresult;
            // osu!stable score formula:
            //   Score += BaseHitValue × (1 + (Combo × DifficultyMultiplier × ModMultiplier) / 25)
            // where Combo is the combo BEFORE this hit (we increment it below),
            // BaseHitValue is the raw `result` (50/100/300 for circles, 30 for slider
            // ends, 10 for slider ticks, etc — already scaled by maxresult per hit type).
            // DifficultyMultiplier is a stepwise int 2..6 from HP+CS+OD baked into
            // this.difficultyMultiplier, and ModMultiplier is `this.scoreMultiplier`.
            this.score += result * (
                1 + (Math.max(0, this.combo) * this.difficultyMultiplier * this.scoreMultiplier) / 25
            );
            let oldCombo = this.combo;
            this.combo = (result > 0) ? this.combo + 1 : 0;
            if (result === 0) {
                this.fullcombo = false;
                if (oldCombo > 20) {
                    window.game.sampleComboBreak.volume = window.game.masterVolume * window.game.effectVolume;
                    window.game.sampleComboBreak.play();
                }
            }
            this.maxcombo = Math.max(this.maxcombo, this.combo);
            if (this.HP >= 0) this.HP += this.HPincreasefor(result);
            this.HP = Math.min(1, this.HP);

            // ── SD / PF instafail ──────────────────────────────────────
            // Sudden Death: any miss (result === 0) on a real hit object
            //   (maxresult === 300, i.e. a circle or slider end — NOT a slider
            //   tick whose maxresult is 10) instantly kills the player.
            // Perfect: any non-300 judgement on a real hit object kills.
            // We force HP to -1 so playback's death check fires next frame.
            if (maxresult === 300 && window.game) {
                if (window.game.perfect && result < 300) {
                    this.HP = -1;
                } else if (window.game.sudden && result === 0) {
                    this.HP = -1;
                }
            }

            this.score4display.set(time, this.score);
            this.combo4display.set(time, this.combo);
            this.accuracy4display.set(time, this.judgeTotal / this.maxJudgeTotal);
            this.HP4display.set(time, Math.max(0, this.HP));
        }

        setSpriteArrayText(arr, str) {
            let width = 0;
            if (str.length > arr.length)
                console.error("displaying string failed");
            for (let i = 0; i < str.length; ++i) {
                let ch = str[i] === "%" ? "percent" : str[i];
                let textname = "score-" + ch + ".png";
                arr[i].texture = Skin[textname];
                arr[i].knownwidth = arr[i].scale.x * (Skin[textname].width + this.charspacing);
                arr[i].visible = true;
                width += arr[i].knownwidth;
            }
            for (let i = str.length; i < arr.length; ++i) {
                arr[i].visible = false;
            }
            arr.width = width;
            arr.useLength = str.length;
        }

        setSpriteArrayPos(arr, x, y) {
            let curx = x;
            if (arr.useLength > 0) {
                for (let i = 0; i < arr.useLength; ++i) {
                    arr[i].x = curx + arr[i].scale.x * this.charspacing / 2;
                    arr[i].y = y;
                    curx += arr[i].knownwidth;
                }
            } else {
                throw "wtf!";
            }
        }

        update(time) {
            if (Number.isNaN(time)) {
                console.error("score overlay update with time = NaN");
                return;
            }
            let HPpos = this.HP4display.valueAt(time) * this.field.width;
            this.HPbar[0].x = HPpos;
            this.HPbar[1].x = HPpos;
            this.HPbar[2].x = HPpos;
            this.setSpriteArrayText(this.scoreDigits, Math.round(this.score4display.valueAt(time)).toString().padStart(8, '0'));
            this.setSpriteArrayText(this.accuracyDigits, (this.accuracy4display.valueAt(time) * 100).toFixed(2) + "%");
            // The top combo is rendered separately by ProgressOverlay (bottom-left),
            // so we hide the legacy combo digits here.
            for (let i = 0; i < this.comboDigits.length; ++i) this.comboDigits[i].visible = false;

            // ── Top-RIGHT layout: score (big) + accuracy (smaller, below) ──
            // Margins generous enough to stop the digits hugging the screen edges
            // and leave breathing room from the iframe/window border.
            const unit = Math.min(this.field.width / 640, this.field.height / 480);
            const margin = 22 * unit;
            const scoreX = this.field.width - margin - this.scoreDigits.width;
            const scoreY = 16 * unit;
            this.setSpriteArrayPos(this.scoreDigits, scoreX, scoreY);
            const accY = scoreY + 24 * unit;
            const accX = this.field.width - margin - this.accuracyDigits.width;
            this.setSpriteArrayPos(this.accuracyDigits, accX, accY);
        }

        showSummary(metadata, hiterrors, retryCallback, quitCallback) {
            function errortext(a) {
                if (!a || a.length === 0) return "—";
                let sum = 0;
                for (let i = 0; i < a.length; ++i) sum += a[i];
                let avg = sum / a.length;
                let sumsqerr = 0;
                for (let i = 0; i < a.length; ++i) sumsqerr += (a[i] - avg) ** 2;
                let stdev = Math.sqrt(sumsqerr / a.length);
                let sgnavg = avg.toFixed(0);
                if (sgnavg[0] !== '-') sgnavg = '+' + sgnavg;
                return sgnavg + "±" + stdev.toFixed(0) + "ms";
            }
            function modstext(game) {
                let l = [];
                if (game.easy) l.push("EZ");
                if (game.nofail) l.push("NF");
                if (game.halftime) l.push("HT");
                if (game.daycore) l.push("DC");
                if (game.hidden) l.push("HD");
                if (game.flashlight) l.push("FL");
                if (game.hardrock) l.push("HR");
                if (game.sudden) l.push("SD");
                if (game.perfect) l.push("PF");
                if (game.doubletime) l.push("DT");
                if (game.nightcore) l.push("NC");
                if (game.relax) l.push("RL");
                if (game.autopilot) l.push("AP");
                if (game.autoplay) l.push("AT");
                return l.length === 0 ? "" : l.join('+');
            }

            const acc = (this.maxJudgeTotal > 0) ? this.judgeTotal / this.maxJudgeTotal : 0;
            const failed = this.HP < 0;
            const rank = failed ? "F" : (acc >= 1 ? 'SS'
                : acc >= 0.95 ? 'S'
                : acc >= 0.9 ? 'A'
                : acc >= 0.8 ? 'B'
                : acc >= 0.7 ? 'C' : 'D');

            // Per-rank accent.
            const rankAccent = {
                SS: ['#fff7c2', '#ffe066'],
                S:  ['#ffd97a', '#ffb84a'],
                A:  ['#a6ffce', '#5be08a'],
                B:  ['#9ecbff', '#5b9bff'],
                C:  ['#d8b6ff', '#a875ff'],
                D:  ['#ffb6c1', '#ff7396'],
                F:  ['#ff8898', '#ff5a78'],
            }[rank] || ['#ffffff', '#aaaaaa'];

            const mods = modstext(window.game);
            const errAvg = errortext(hiterrors);

            // ── pp calculation (osu!stable simplified) ──────────────
            // Uses overlay/pp.js to compute aim/speed/accuracy components
            // from the actual hit-object pattern (stars). Falls back to a
            // light estimator only when no track reference was provided.
            function legacyEstimatePp(stats, mods) {
                const total = (stats.great | 0) + (stats.good | 0) + (stats.meh | 0) + (stats.miss | 0);
                if (total <= 0) return 0;
                const acc = ((stats.great | 0) * 300 + (stats.good | 0) * 100 + (stats.meh | 0) * 50)
                          / (total * 300);
                const star = Math.min(8.5, Math.max(1.0, 1 + Math.log10(Math.max(1, total / 50)) * 2.4));
                const aim  = Math.pow(5 * Math.max(1, star / 0.0675) - 4, 3) / 100000;
                const accF = Math.pow(acc, 22);
                const cmb = Math.min(1, Math.pow(((stats.maxcombo | 0) || 0) / Math.max(1, total), 0.8));
                const mPen = Math.pow(0.97, (stats.miss | 0));
                let mod = 1.0;
                const m = (mods || '').toUpperCase();
                if (m.includes('HD')) mod *= 1.06;
                if (m.includes('HR')) mod *= 1.10;
                if (m.includes('NC') || m.includes('DT')) mod *= 1.18;
                if (m.includes('FL')) mod *= 1.12;
                if (m.includes('EZ')) mod *= 0.50;
                if (m.includes('HT') || m.includes('DC')) mod *= 0.30;
                if (m.includes('RL') || m.includes('AP') || m.includes('AT')) mod *= 0;
                return Math.max(0, Math.round(aim * accF * cmb * mPen * mod));
            }

            let ppEstimate, ppBreakdown = null, starRating = null, ppSource = 'manual';

            // ── 1) rosu-pp-js (WASM) — bit-for-bit with osu.ppy.sh ─
            // Tries first because it's the most accurate path. Returns
            // null synchronously if the WASM hasn't finished initialising
            // or if the .osu text is somehow unparseable; we then fall
            // through to the manual aim/speed/acc calc.
            let rosuResult = null;
            if (this.track && PP && typeof PP.tryRosu === 'function') {
                try {
                    rosuResult = PP.tryRosu(this.track, {
                        mods,
                        accuracy: acc,
                        count300:  this.judgecnt.great,
                        count100:  this.judgecnt.good,
                        count50:   this.judgecnt.meh,
                        countMiss: this.judgecnt.miss,
                        maxCombo:  this.maxcombo,
                    });
                } catch (e) {
                    console.warn('[score] rosu-pp-js threw, falling back:', e);
                }
            }

            if (rosuResult) {
                starRating  = rosuResult.stars;
                ppBreakdown = rosuResult.pp;
                ppEstimate  = ppBreakdown.total;
                ppSource    = 'rosu-pp-js';
            } else if (this.track && PP && PP.calculateStars) {
                try {
                    starRating = PP.calculateStars(this.track, { mods });
                    // Resolve the map's true max combo. Prefer a precomputed
                    // value on the track, otherwise derive it from the actual
                    // hit-objects (head + ticks + repeats per slider, +1 per
                    // circle/spinner) — the same value osu!stable uses for
                    // pp combo scaling. Fall back to total hit count only as
                    // an absolute last resort.
                    let totalMaxCombo = (this.track && this.track.maxCombo) | 0;
                    if (!totalMaxCombo && PP.calculateMaxCombo) {
                        totalMaxCombo = PP.calculateMaxCombo(this.track) | 0;
                    }
                    if (!totalMaxCombo) {
                        totalMaxCombo = this.judgecnt.great + this.judgecnt.good
                                      + this.judgecnt.meh + this.judgecnt.miss;
                    }
                    ppBreakdown = PP.calculatePP({
                        stars: starRating,
                        accuracy: acc,
                        count300: this.judgecnt.great,
                        count100: this.judgecnt.good,
                        count50:  this.judgecnt.meh,
                        countMiss: this.judgecnt.miss,
                        maxCombo: this.maxcombo,
                        totalMaxCombo: totalMaxCombo,
                        mods,
                        OD: this.track.difficulty.OverallDifficulty,
                        AR: this.track.difficulty.ApproachRate,
                        CS: this.track.difficulty.CircleSize,
                    });
                    ppEstimate = ppBreakdown.total;
                } catch (e) {
                    console.error('[score] pp computation failed', e);
                    ppEstimate = legacyEstimatePp({
                        great: this.judgecnt.great, good: this.judgecnt.good,
                        meh:   this.judgecnt.meh,   miss: this.judgecnt.miss,
                        maxcombo: this.maxcombo,
                    }, mods);
                }
            } else {
                ppEstimate = legacyEstimatePp({
                    great: this.judgecnt.great, good: this.judgecnt.good,
                    meh:   this.judgecnt.meh,   miss: this.judgecnt.miss,
                    maxcombo: this.maxcombo,
                }, mods);
            }
            // Verdict — Perfect (SS + FC, no 100/50/miss) ranks above Full Combo.
            const isPerfect = !failed
                && this.fullcombo
                && (this.judgecnt.good | 0) === 0
                && (this.judgecnt.meh  | 0) === 0
                && (this.judgecnt.miss | 0) === 0;
            const verdictHtml = isPerfect
                ? `<div class="ws-verdict ws-verdict-perfect" data-verdict="perfect">
                       <span class="ws-verdict-shine" aria-hidden="true"></span>
                       <span class="ws-verdict-text">Perfect</span>
                   </div>`
                : (this.fullcombo && !failed
                    ? `<div class="ws-verdict ws-verdict-fc" data-verdict="fullcombo">
                           <span class="ws-verdict-text">Full Combo</span>
                       </div>`
                    : (failed
                        ? `<div class="ws-verdict ws-verdict-failed" data-verdict="failed">
                               <span class="ws-verdict-text">Failed</span>
                           </div>`
                        : `<div class="ws-verdict ws-verdict-clear" data-verdict="clear">
                               <span class="ws-verdict-text">Clear</span>
                           </div>`));
            // Legacy FC pill kept empty (replaced by ws-verdict above).
            const fcBadge = '';
            const failBadge = '';

            // ── Performance graph (osu! classic style) ─────────────────
            // Plots running accuracy across the play on a deep-blue background,
            // with the line coloured by current accuracy band:
            //   green / lime  → ≥ 80 % (S / SS territory)
            //   yellow        → 60-80 %  (A-B)
            //   red           → < 60 %    (C and below, lots of misses)
            // Y axis: 0 % at the bottom, 100 % at the top. The line is drawn as
            // a sequence of small coloured segments so the colour follows the
            // running accuracy in real time, exactly like classic osu!.
            function buildPerfSvg(errors, judgecnt) {
                if ((!errors || errors.length === 0) && (!judgecnt || (judgecnt.great + judgecnt.good + judgecnt.meh + judgecnt.miss) === 0)) {
                    return `
                        <div class="ws-perf">
                            <svg class="ws-perf-svg" viewBox="0 0 240 92" preserveAspectRatio="none">
                                <text x="6" y="14" fill="rgba(255,255,255,0.75)" font-size="10" font-style="italic" font-weight="600">performance</text>
                                <text x="234" y="86" text-anchor="end" fill="rgba(255,255,255,0.75)" font-size="10" font-style="italic" font-weight="600">time</text>
                            </svg>
                            <div class="ws-perf-foot"><span>—</span><span></span></div>
                        </div>`;
                }
                const W = 240, H = 92, padX = 4, padY = 6;
                // Hit windows (osu! defaults, OD8). Used to derive each hit's
                // judgement weight from its timing error.
                const w300 = 16, w100 = 37, w50 = 58;
                // Build a per-note judgement series. Misses don't appear in
                // `errors` (no error was recorded) so we splice them in evenly
                // across the timeline so the running accuracy reflects them.
                const hits = [];
                for (let i = 0; i < (errors ? errors.length : 0); ++i) {
                    const ae = Math.abs(errors[i]);
                    if (ae <= w300)      hits.push(300);
                    else if (ae <= w100) hits.push(100);
                    else if (ae <= w50)  hits.push(50);
                    else                  hits.push(0); // late/early outlier counts as miss
                }
                const missCount = (judgecnt && (judgecnt.miss | 0)) || 0;
                if (missCount > 0 && hits.length > 0) {
                    const total = hits.length + missCount;
                    // Distribute misses with deterministic stride so the same
                    // play always renders the same curve.
                    const stride = total / missCount;
                    let inserted = 0;
                    for (let m = 0; m < missCount; m++) {
                        const idx = Math.min(hits.length, Math.round((m + 0.5) * stride) - inserted);
                        hits.splice(idx, 0, 0);
                        inserted++;
                    }
                }
                if (hits.length === 0) {
                    // Pure miss-only plays — fabricate so the curve drops.
                    for (let i = 0; i < Math.max(missCount, 1); i++) hits.push(0);
                }

                // Compute running accuracy [0..1] at each hit.
                const running = new Array(hits.length);
                let acc = 0;
                for (let i = 0; i < hits.length; ++i) {
                    acc += hits[i];
                    running[i] = acc / ((i + 1) * 300);
                }

                // Down-sample to a smooth-but-still-detailed series. Long plays
                // get binned, short plays render every hit.
                const targetPts = Math.min(hits.length, 220);
                const samples = new Array(targetPts);
                for (let s = 0; s < targetPts; s++) {
                    const a = Math.floor((s / targetPts) * hits.length);
                    const b = Math.max(a + 1, Math.floor(((s + 1) / targetPts) * hits.length));
                    let sum = 0, n = 0;
                    for (let i = a; i < b && i < hits.length; ++i) { sum += running[i]; n++; }
                    samples[s] = n > 0 ? sum / n : 0;
                }

                // Light smoothing (3-tap moving average) to soften jagged steps.
                const smoothed = samples.map((_, i) => {
                    const a = Math.max(0, i - 1);
                    const b = Math.min(samples.length - 1, i + 1);
                    let s = 0, n = 0;
                    for (let k = a; k <= b; ++k) { s += samples[k]; n++; }
                    return s / n;
                });

                const xAt = (i) => padX + (i / Math.max(1, smoothed.length - 1)) * (W - padX * 2);
                const yAt = (v) => H - padY - v * (H - padY * 2);

                // Colour the line per-segment based on the current running acc.
                // Two thresholds: 60 % (red) and 80 % (yellow). Above 80 % = green.
                function segColor(v) {
                    if (v < 0.60) return '#ff2929';
                    if (v < 0.80) return '#ffd838';
                    return '#9bff3a';
                }

                // Build a polyline split into coloured segments.
                let segments = '';
                for (let i = 1; i < smoothed.length; ++i) {
                    const x1 = xAt(i - 1).toFixed(2);
                    const y1 = yAt(smoothed[i - 1]).toFixed(2);
                    const x2 = xAt(i).toFixed(2);
                    const y2 = yAt(smoothed[i]).toFixed(2);
                    const v = (smoothed[i - 1] + smoothed[i]) / 2;
                    const c = segColor(v);
                    segments += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />`;
                }

                // Footer stats from raw hit errors (kept for context).
                let avg = 0, stdev = 0;
                if (errors && errors.length > 0) {
                    let sum = 0; for (let i = 0; i < errors.length; ++i) sum += errors[i];
                    avg = sum / errors.length;
                    let sse = 0; for (let i = 0; i < errors.length; ++i) sse += (errors[i] - avg) ** 2;
                    stdev = Math.sqrt(sse / errors.length);
                }
                const finalAcc = smoothed[smoothed.length - 1] || 0;

                return `
                    <div class="ws-perf">
                        <svg class="ws-perf-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
                            <!-- subtle reference line at 80% (S threshold) -->
                            <line x1="0" y1="${yAt(0.80).toFixed(2)}" x2="${W}" y2="${yAt(0.80).toFixed(2)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="2,3"/>
                            <!-- coloured polyline -->
                            ${segments}
                            <!-- corner labels -->
                            <text x="6" y="14" fill="rgba(255,255,255,0.75)" font-size="10" font-style="italic" font-weight="600" letter-spacing="0.04em">performance</text>
                            <text x="${W - 6}" y="${H - 6}" text-anchor="end" fill="rgba(255,255,255,0.75)" font-size="10" font-style="italic" font-weight="600" letter-spacing="0.04em">time</text>
                        </svg>
                        <div class="ws-perf-foot">
                            <span><b>${avg >= 0 ? '+' : ''}${avg.toFixed(1)}ms</b> avg</span>
                            <span class="ws-perf-legend">
                                <i class="d-bad"></i>&lt;60%
                                <i class="d-mid"></i>&lt;80%
                                <i class="d-good"></i>≥80%
                            </span>
                            <span><b>±${stdev.toFixed(1)}ms</b> stdev</span>
                        </div>
                    </div>`;
            }
            const perfHtml = buildPerfSvg(hiterrors, this.judgecnt);

            // Inject our scoped styles (only once).
            if (!document.getElementById('ws-summary-styles')) {
                const style = document.createElement('style');
                style.id = 'ws-summary-styles';
                style.textContent = `
                    #ws-summary {
                        position: fixed; inset: 0; z-index: 12000;
                        display: flex; align-items: center; justify-content: center;
                        padding: 48px 24px;
                        background: radial-gradient(ellipse at 30% 20%, rgba(255,102,170,0.10) 0%, transparent 45%),
                                    radial-gradient(ellipse at 70% 80%, rgba(179,136,255,0.10) 0%, transparent 45%),
                                    rgba(0,0,0,0.78);
                        backdrop-filter: blur(18px);
                        -webkit-backdrop-filter: blur(18px);
                        font-family: "Inter", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
                        color: #fff;
                        opacity: 0;
                        transition: opacity 380ms cubic-bezier(0.22,1,0.36,1);
                    }
                    #ws-summary.ws-show { opacity: 1; }

                    .ws-card {
                        width: 100%; max-width: 980px;
                        background: linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
                        border: 1px solid rgba(255,255,255,0.10);
                        border-radius: 22px;
                        padding: 36px 40px 32px;
                        display: grid; grid-template-columns: 1fr 260px; gap: 36px;
                        position: relative;
                        box-shadow: 0 24px 64px -16px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03) inset;
                    }
                    .ws-eyebrow {
                        font-size: 10.5px; font-weight: 600;
                        text-transform: uppercase; letter-spacing: 0.42em;
                        color: rgba(255,255,255,0.42);
                        margin-bottom: 6px;
                    }
                    .ws-title {
                        font-size: 30px; font-weight: 800; letter-spacing: -0.02em;
                        line-height: 1.15; color: #fff;
                        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                    }
                    .ws-meta {
                        margin-top: 4px;
                        font-size: 13px; color: rgba(255,255,255,0.6);
                    }
                    .ws-meta b { color: rgba(255,255,255,0.82); font-weight: 600; }
                    .ws-mods {
                        display: inline-flex; gap: 6px; margin-left: 8px;
                    }
                    .ws-mods span {
                        padding: 2px 8px; border-radius: 99px;
                        font-size: 9.5px; font-weight: 700; letter-spacing: 0.18em;
                        background: rgba(255,102,170,0.16); color: #ffb3d4;
                        border: 1px solid rgba(255,102,170,0.32);
                    }

                    .ws-stats {
                        margin-top: 28px;
                        display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px 18px;
                    }
                    .ws-stat {
                        display: flex; flex-direction: column; gap: 4px;
                        padding: 14px 16px; border-radius: 12px;
                        background: rgba(255,255,255,0.03);
                        border: 1px solid rgba(255,255,255,0.06);
                    }
                    .ws-stat .label {
                        font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.32em;
                        color: rgba(255,255,255,0.5); font-weight: 600;
                    }
                    .ws-stat .value {
                        font-size: 22px; font-weight: 800; letter-spacing: -0.01em;
                        font-variant-numeric: tabular-nums;
                    }
                    .ws-stat .value.score   { font-size: 28px; color: #fff; }
                    .ws-stat .value.acc     { color: #cce6ff; }
                    .ws-stat .value.combo   { color: #ffe9b3; }
                    .ws-stat .value.pp      {
                        color: #ff9ec7;
                        font-size: 26px;
                        text-shadow: 0 0 18px rgba(255, 158, 199, 0.35);
                    }
                    .ws-stat .value.pp .pp-unit {
                        font-size: 13px;
                        font-weight: 700;
                        margin-left: 4px;
                        color: rgba(255, 158, 199, 0.65);
                        letter-spacing: 0.04em;
                    }
                    /* pp breakdown — small aim/speed/acc chips below the
                     * total. Only shown when overlay/pp.js produced a
                     * detailed breakdown. */
                    .ws-pp-breakdown {
                        margin-top: 6px;
                        display: flex; gap: 10px;
                        font-size: 9.5px; letter-spacing: 0.18em; text-transform: uppercase;
                        color: rgba(255,255,255,0.45);
                        font-variant-numeric: tabular-nums;
                    }
                    .ws-pp-breakdown b {
                        color: rgba(255, 158, 199, 0.95);
                        font-weight: 800;
                        margin-right: 3px;
                    }
                    .ws-pp-breakdown i { font-style: normal; color: rgba(255,255,255,0.32); }
                    .ws-stat .value.err     { color: #d8b6ff; font-size: 18px; }

                    .ws-hits {
                        margin-top: 14px;
                        display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
                    }
                    .ws-hit {
                        display: flex; align-items: center; justify-content: space-between;
                        padding: 10px 14px; border-radius: 10px;
                        background: rgba(255,255,255,0.025);
                        border: 1px solid rgba(255,255,255,0.05);
                        font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
                        color: rgba(255,255,255,0.7);
                    }
                    .ws-hit .n {
                        font-size: 16px; font-weight: 800; color: #fff;
                        font-variant-numeric: tabular-nums;
                    }
                    .ws-hit.great .n { color: #66ccff; }
                    .ws-hit.good  .n { color: #88e066; }
                    .ws-hit.meh   .n { color: #ffcc22; }
                    .ws-hit.miss  .n { color: #ff6280; }

                    .ws-rank-col {
                        display: flex; flex-direction: column; align-items: center; justify-content: space-between;
                        gap: 16px;
                    }
                    .ws-rank-wrap { position: relative; }
                    .ws-rank {
                        font-size: 156px; font-weight: 900; line-height: 1;
                        letter-spacing: -0.06em;
                        background: linear-gradient(180deg, var(--ws-r1, #fff) 0%, var(--ws-r2, #ccc) 100%);
                        -webkit-background-clip: text; background-clip: text;
                        -webkit-text-fill-color: transparent;
                        filter:
                            drop-shadow(0 0 28px var(--ws-r-glow, rgba(255,255,255,0.55)))
                            drop-shadow(0 0 56px var(--ws-r-glow2, rgba(255,255,255,0.30)))
                            drop-shadow(0 8px 24px rgba(0,0,0,0.55));
                        animation: ws-rank-pulse 2.6s ease-in-out infinite;
                    }
                    @keyframes ws-rank-pulse {
                        0%, 100% { transform: scale(1); }
                        50%      { transform: scale(1.025); }
                    }

                    /* Performance graph under the rank. */
                    .ws-perf-wrap {
                        position: relative;
                        width: 100%;
                    }
                    .ws-perf-wrap .ws-verdict {
                        position: absolute;
                        left: 50%;
                        top: calc(50% - 14px); /* nudge above the foot row */
                        transform: translate(-50%, -50%);
                        padding: 0 8px;
                        pointer-events: none;
                        z-index: 2;
                    }
                    .ws-perf-wrap .ws-verdict .ws-verdict-text {
                        white-space: nowrap;
                    }
                    /* Slightly smaller verdict when it sits on top of the graph. */
                    .ws-perf-wrap .ws-verdict-perfect .ws-verdict-text { font-size: 44px; }
                    .ws-perf-wrap .ws-verdict-fc .ws-verdict-text     { font-size: 28px; }
                    .ws-perf-wrap .ws-verdict-clear .ws-verdict-text  { font-size: 24px; }
                    .ws-perf-wrap .ws-verdict-failed .ws-verdict-text { font-size: 28px; }
                    .ws-perf {
                        display: flex; flex-direction: column; align-items: stretch; gap: 6px;
                        width: 100%;
                    }
                    .ws-perf-head {
                        display: flex; justify-content: space-between; align-items: baseline;
                        font-size: 9px; text-transform: uppercase; letter-spacing: 0.32em;
                        color: rgba(255,255,255,0.45); font-weight: 600;
                    }
                    .ws-perf-head .scale {
                        font-variant-numeric: tabular-nums;
                        color: rgba(255,255,255,0.32);
                    }
                    .ws-perf-svg {
                        width: 100%;
                        height: 110px;
                        background: transparent;
                        border-radius: 10px;
                        border: 1px solid rgba(255,255,255,0.08);
                        display: block;
                    }
                    .ws-perf-foot {
                        display: flex; justify-content: space-between;
                        font-size: 9.5px;
                        color: rgba(255,255,255,0.42);
                        font-variant-numeric: tabular-nums;
                    }
                    .ws-perf-foot b { color: rgba(255,255,255,0.78); font-weight: 700; }
                    .ws-perf-legend {
                        display: inline-flex; align-items: center; gap: 10px;
                        font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase;
                        color: rgba(255,255,255,0.55);
                    }
                    .ws-perf-legend i {
                        display: inline-block; width: 7px; height: 7px;
                        border-radius: 50%; margin-right: 4px;
                        vertical-align: -1px;
                    }
                    .ws-perf-legend .d-bad  { background: #ff2929; box-shadow: 0 0 6px #ff292988; }
                    .ws-perf-legend .d-mid  { background: #ffd838; box-shadow: 0 0 6px #ffd83888; }
                    .ws-perf-legend .d-good { background: #9bff3a; box-shadow: 0 0 6px #9bff3a88; }

                    .ws-fc {
                        font-size: 10px; font-weight: 700;
                        letter-spacing: 0.32em; text-transform: uppercase;
                        padding: 6px 12px; border-radius: 99px;
                        background: rgba(125, 255, 184, 0.12);
                        border: 1px solid rgba(125, 255, 184, 0.36);
                        color: #a6ffce;
                    }
                    .ws-fc.ws-failed {
                        background: rgba(255, 90, 120, 0.12);
                        border-color: rgba(255, 90, 120, 0.36);
                        color: #ff9aa8;
                    }

                    /* Verdict — big rainbow "Perfect" / Full Combo / Clear / Failed */
                    .ws-verdict {
                        position: relative;
                        display: inline-flex; align-items: center; justify-content: center;
                        padding: 4px 14px;
                        line-height: 1;
                        overflow: hidden;
                    }
                    .ws-verdict-text {
                        font-weight: 900;
                        letter-spacing: -0.02em;
                        font-style: italic;
                        transform: skewX(-6deg);
                        -webkit-background-clip: text; background-clip: text;
                        -webkit-text-fill-color: transparent; color: transparent;
                        filter: drop-shadow(0 6px 18px rgba(0,0,0,0.55));
                    }
                    .ws-verdict-perfect .ws-verdict-text {
                        font-size: 56px;
                        background-image: linear-gradient(90deg,
                            #ffd66a 0%, #ff9a4d 18%, #ff6b9c 38%,
                            #c478ff 58%, #66c6ff 78%, #8be76b 100%);
                        text-shadow:
                            0 0 28px rgba(255, 214, 106, 0.35),
                            0 0 56px rgba(255, 107, 156, 0.22);
                        animation: ws-verdict-pulse 2.4s ease-in-out infinite;
                    }
                    @keyframes ws-verdict-pulse {
                        0%, 100% { transform: scale(1); }
                        50%      { transform: scale(1.025); }
                    }
                    .ws-verdict-perfect .ws-verdict-shine {
                        position: absolute;
                        top: -10%; left: -40%;
                        width: 35%; height: 120%;
                        background: linear-gradient(90deg,
                            transparent 0%, rgba(255,255,255,0.22) 50%, transparent 100%);
                        transform: rotate(12deg);
                        animation: ws-verdict-shine 2.6s linear infinite;
                        pointer-events: none;
                    }
                    @keyframes ws-verdict-shine {
                        0%   { transform: translateX(0)    rotate(12deg); }
                        100% { transform: translateX(560%) rotate(12deg); }
                    }
                    .ws-verdict-fc .ws-verdict-text {
                        font-size: 36px;
                        background-image: linear-gradient(90deg,
                            #8be76b 0%, #aaffd6 50%, #66c6ff 100%);
                        text-shadow: 0 0 18px rgba(139,231,107,0.30);
                    }
                    .ws-verdict-clear .ws-verdict-text {
                        font-size: 32px;
                        background-image: linear-gradient(90deg,
                            rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.55) 100%);
                    }
                    .ws-verdict-failed .ws-verdict-text {
                        font-size: 36px;
                        background-image: linear-gradient(90deg,
                            #ff5d6c 0%, #ff9aa8 100%);
                        text-shadow: 0 0 18px rgba(255,93,108,0.30);
                    }

                    .ws-actions {
                        display: flex; gap: 10px; width: 100%;
                    }
                    .ws-btn {
                        flex: 1;
                        height: 48px;
                        display: flex; align-items: center; justify-content: center;
                        border-radius: 12px;
                        font-size: 12px; font-weight: 700; letter-spacing: 0.28em;
                        text-transform: uppercase;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.10);
                        color: rgba(255,255,255,0.85);
                        cursor: pointer; user-select: none;
                        transition: transform 160ms ease, background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 220ms ease;
                    }
                    .ws-btn:hover { transform: translateY(-1px); }
                    .ws-btn.retry:hover {
                        background: rgba(140, 180, 255, 0.10);
                        border-color: rgba(140, 180, 255, 0.40);
                        color: #b9d2ff;
                        box-shadow: 0 8px 28px -10px rgba(140, 180, 255, 0.45);
                    }
                    .ws-btn.quit:hover {
                        background: rgba(255, 90, 120, 0.10);
                        border-color: rgba(255, 90, 120, 0.40);
                        color: #ff9aa8;
                        box-shadow: 0 8px 28px -10px rgba(255, 90, 120, 0.45);
                    }

                    @media (max-width: 720px) {
                        .ws-card { grid-template-columns: 1fr; padding: 26px 22px 22px; }
                        .ws-rank-col { flex-direction: row; flex-wrap: wrap; }
                        .ws-rank { font-size: 110px; }
                        .ws-stats { grid-template-columns: 1fr; }
                        .ws-hits { grid-template-columns: repeat(2, 1fr); }
                        .ws-verdict-perfect .ws-verdict-text { font-size: 40px; }
                        .ws-verdict-fc .ws-verdict-text,
                        .ws-verdict-clear .ws-verdict-text,
                        .ws-verdict-failed .ws-verdict-text { font-size: 28px; }
                    }
                `;
                document.head.appendChild(style);
            }

            // Build the markup.
            const root = document.createElement('div');
            root.id = 'ws-summary';
            root.innerHTML = `
                <div class="ws-card">
                    <div class="ws-left">
                        <div class="ws-eyebrow">Results</div>
                        <div class="ws-title">${(metadata.Title || '').replace(/</g, '&lt;')}</div>
                        <div class="ws-meta">
                            <b>${(metadata.Artist || '').replace(/</g, '&lt;')}</b> · ${(metadata.Version || '').replace(/</g, '&lt;')}
                            · mapped by <b>${(metadata.Creator || '').replace(/</g, '&lt;')}</b>
                            ${mods ? `<span class="ws-mods"><span>${mods}</span></span>` : ''}
                        </div>

                        <div class="ws-stats">
                            <div class="ws-stat">
                                <div class="label">Score</div>
                                <div class="value score">${Math.round(this.score).toLocaleString('en-US')}</div>
                            </div>
                            <div class="ws-stat">
                                <div class="label">Accuracy</div>
                                <div class="value acc">${(acc * 100).toFixed(2)}%</div>
                            </div>
                            <div class="ws-stat">
                                <div class="label">Max Combo</div>
                                <div class="value combo">${this.maxcombo}x</div>
                            </div>
                            <div class="ws-stat">
                                <div class="label">pp${starRating ? ` · ${starRating.total.toFixed(2)}★` : ''}${ppSource === 'rosu-pp-js' ? ' · rosu-pp' : ''}</div>
                                <div class="value pp">${ppEstimate.toLocaleString('en-US')}<span class="pp-unit">pp</span></div>
                                ${ppBreakdown ? `
                                <div class="ws-pp-breakdown" data-testid="pp-breakdown">
                                    <span><b>${ppBreakdown.aim.toLocaleString('en-US')}</b><i>aim</i></span>
                                    <span><b>${ppBreakdown.speed.toLocaleString('en-US')}</b><i>speed</i></span>
                                    <span><b>${ppBreakdown.acc.toLocaleString('en-US')}</b><i>acc</i></span>
                                    ${ppBreakdown.flashlight ? `<span><b>${ppBreakdown.flashlight.toLocaleString('en-US')}</b><i>fl</i></span>` : ''}
                                </div>` : ''}
                            </div>
                        </div>

                        <div class="ws-hits">
                            <div class="ws-hit great"><span>300</span><span class="n">${this.judgecnt.great}</span></div>
                            <div class="ws-hit good"><span>100</span><span class="n">${this.judgecnt.good}</span></div>
                            <div class="ws-hit meh"><span>50</span><span class="n">${this.judgecnt.meh}</span></div>
                            <div class="ws-hit miss"><span>Miss</span><span class="n">${this.judgecnt.miss}</span></div>
                        </div>
                    </div>

                    <div class="ws-rank-col">
                        <div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
                            <div class="ws-eyebrow">Rank</div>
                            <div class="ws-rank-wrap">
                                <div class="ws-rank" style="
                                    --ws-r1: ${rankAccent[0]};
                                    --ws-r2: ${rankAccent[1]};
                                    --ws-r-glow: ${rankAccent[1]}aa;
                                    --ws-r-glow2: ${rankAccent[0]}55;
                                ">${rank}</div>
                            </div>
                            ${fcBadge}${failBadge}
                        </div>

                        <div class="ws-perf-wrap">
                            ${perfHtml}
                            ${verdictHtml}
                        </div>

                        <div class="ws-actions">
                            <div class="ws-btn retry" data-action="retry">Retry</div>
                            <div class="ws-btn quit"  data-action="quit">Quit</div>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(root);
            // Force reflow then add the class to fade the overlay in.
            root.offsetHeight; // eslint-disable-line no-unused-expressions
            requestAnimationFrame(() => root.classList.add('ws-show'));

            const cleanup = () => {
                root.classList.remove('ws-show');
                setTimeout(() => root.remove(), 360);
            };
            root.querySelector('[data-action="retry"]').addEventListener('click', () => {
                cleanup(); retryCallback && retryCallback();
            });
            root.querySelector('[data-action="quit"]').addEventListener('click', () => {
                cleanup(); quitCallback && quitCallback();
            });

            // Generate summary data + persist play history (unchanged behaviour).
            const summary = {
                sid: metadata.BeatmapSetID,
                bid: metadata.BeatmapID,
                title: metadata.Title,
                version: metadata.Version,
                mods: mods,
                grade: rank,
                score: Math.round(this.score).toString(),
                combo: this.maxcombo.toString(),
                acc: (acc * 100).toFixed(2) + "%",
                time: new Date().getTime(),
            };
            if (!window.playHistory1000) window.playHistory1000 = [];
            window.playHistory1000.push(summary);
            if (window.playHistory1000.length > 1000) window.playHistory1000.shift();
            if (window.localforage) {
                window.localforage.setItem("playhistory1000", window.playHistory1000, function (err) {
                    if (err) console.error("Error saving play history");
                });
            }
        }

        // ── Death menu ─────────────────────────────────────────────
        // Triggered when the player's HP drops below 0 mid-play. Reuses
        // the existing pause-menu DOM (same styling) but swaps the title
        // for "dead" and hides the Continue button — only Retry / Quit
        // are offered.
        showDeathMenu(metadata, hiterrors, retryCallback, quitCallback) {
            const menu     = document.getElementById('pause-menu');
            const titleEl  = menu ? menu.querySelector('.paused-title') : null;
            const btnCont  = document.getElementById('pausebtn-continue');
            const btnRetry = document.getElementById('pausebtn-retry');
            const btnQuit  = document.getElementById('pausebtn-quit');
            if (!menu || !btnRetry || !btnQuit) {
                // No pause-menu DOM available (older skin/template).
                // Fallback: show the regular results screen marked failed.
                this.visible = false;
                this.showSummary(metadata, hiterrors, retryCallback, quitCallback);
                return;
            }

            // Switch the menu into "death" mode.
            menu.classList.add('is-dead');
            menu.setAttribute('data-mode', 'dead');
            const previousTitle = titleEl ? titleEl.textContent : '';
            if (titleEl) titleEl.textContent = 'dead';
            if (btnCont) btnCont.style.display = 'none';

            const cleanup = () => {
                menu.setAttribute('hidden', '');
                menu.classList.remove('is-dead');
                menu.removeAttribute('data-mode');
                if (titleEl) titleEl.textContent = previousTitle || 'paused';
                if (btnCont) btnCont.style.display = '';
                btnRetry.onclick = null;
                btnQuit.onclick = null;
                // ── Death animation cleanup ─────────────────────────
                // Remove the slow-mo filter on the canvas + drop the
                // red vignette so the next attempt starts fresh.
                try {
                    const ga = document.getElementById('game-area');
                    if (ga) ga.classList.remove('is-dying');
                    const vg = document.getElementById('death-vignette');
                    if (vg && vg.parentNode) vg.parentNode.removeChild(vg);
                } catch (_) {}
            };
            btnRetry.onclick = () => { cleanup(); retryCallback && retryCallback(); };
            btnQuit.onclick  = () => { cleanup(); quitCallback  && quitCallback();  };

            menu.removeAttribute('hidden');

            // Persist the failed attempt in play history.
            try {
                const total = (this.judgecnt.great | 0) + (this.judgecnt.good | 0)
                            + (this.judgecnt.meh   | 0) + (this.judgecnt.miss | 0);
                const acc = this.maxJudgeTotal > 0 ? this.judgeTotal / this.maxJudgeTotal : 0;
                const summary = {
                    sid: metadata.BeatmapSetID,
                    bid: metadata.BeatmapID,
                    title: metadata.Title,
                    version: metadata.Version,
                    grade: 'F',
                    score: Math.round(this.score).toString(),
                    combo: this.maxcombo.toString(),
                    acc: (acc * 100).toFixed(2) + '%',
                    notes: total,
                    failed: true,
                    time: new Date().getTime(),
                };
                if (!window.playHistory1000) window.playHistory1000 = [];
                window.playHistory1000.push(summary);
                if (window.playHistory1000.length > 1000) window.playHistory1000.shift();
                if (window.localforage) {
                    window.localforage.setItem('playhistory1000', window.playHistory1000, function (err) {
                        if (err) console.error('Error saving play history');
                    });
                }
            } catch (_) { /* never let history saving block the menu */ }
        }

        // Optionally override destroy if you need to clean up custom properties
        destroy(options) {
            super.destroy(options);
        }
    }

    return ScoreOverlay;
});
