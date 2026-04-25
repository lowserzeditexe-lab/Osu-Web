/*
* class: ProgressOverlay (extends PIXI.Container)
*
* Bottom-LEFT  : current combo counter (sourced from window.scoreOverlay).
*                Hidden while combo === 0.
* Top-RIGHT    : pie-chart of song progression, sitting just to the LEFT of
*                the accuracy percentage rendered by ScoreOverlay.
*/

define([], function () {
    class ProgressOverlay extends PIXI.Container {
        constructor(windowfield, starttime, endtime) {
            super();
            this.starttime = starttime;
            this.endtime = endtime;
            this.field = windowfield;

            // ── Combo, bottom-left (replaces the elapsed-time readout) ──
            // The digit itself stays exactly the same size and position — we
            // just enlarge the SPACE around it so the antialiased edges /
            // halo are never clipped by the texture frame.
            //
            // Trick: PIXI BitmapText uses pre-baked tight glyph textures, so
            // `style.padding` is ignored. Instead we attach a noop AlphaFilter
            // and override its `padding` and the BitmapText's `filterArea` to
            // enlarge the actual render rectangle by 32 px on every side
            // (same idea as inset:-12px on the avatar SVG).
            this.combo = new PIXI.BitmapText("0x", { fontName: 'Venera', fontSize: 44, tint: 0xddffff });
            this.combo.anchor.set(0, 1);
            this.combo.alpha = 0;       // start hidden — only fade in once a hit lands
            const comboPad = new PIXI.filters.AlphaFilter(1);
            comboPad.padding = 32;
            this.combo.filters = [comboPad];
            this.addChild(this.combo);

            // ── Pie-chart progress, top-right (sits next to the accuracy %) ──
            this.pieRadius = 14;
            this.pieThickness = 3;
            this.pie = new PIXI.Graphics();
            this.addChild(this.pie);

            this.resize(windowfield);
        }

        resize(windowfield) {
            this.field = windowfield;

            // Combo bottom-LEFT — generous margin from the screen edge so the
            // digit has REAL empty space around it (was 22 → 64).
            const unit = Math.min(windowfield.width / 640, windowfield.height / 480);
            this.combo.x = 64 * unit;
            this.combo.y = windowfield.height - 64 * unit;

            // Fallback position (overridden each frame in update() once we
            // can read the live accuracy x/y from ScoreOverlay).
            this.pieCx = windowfield.width - 22 * unit - 130;
            this.pieCy = 16 * unit + 24 * unit + this.pieRadius / 2;
        }

        _drawPie(progress) {
            const cx = this.pieCx, cy = this.pieCy, r = this.pieRadius, t = this.pieThickness;
            const p = Math.max(0, Math.min(1, progress));
            const startAngle = -Math.PI / 2;
            const endAngle = startAngle + p * Math.PI * 2;

            this.pie.clear();

            // Outer track (full circle, dim white).
            this.pie.lineStyle(t, 0x000000, 0.45);
            this.pie.drawCircle(cx, cy, r);
            this.pie.lineStyle(t, 0xffffff, 0.55);
            this.pie.drawCircle(cx, cy, r);

            // Progress arc on top — bright accent so it pops on any backdrop.
            if (p > 0.0001) {
                this.pie.lineStyle(t, 0x66ccff, 1.0);
                this.pie.arc(cx, cy, r, startAngle, endAngle, false);
            }
        }

        update(time) {
            // ── Pin the pie just to the LEFT of the accuracy text rendered
            // by ScoreOverlay. We read its sprite array's first sprite for
            // the precise (x, y) so the layout stays perfectly aligned even
            // as accuracy width grows from "0.00%" to "100.00%".
            const so = window.scoreOverlay;
            if (so && so.accuracyDigits && so.accuracyDigits[0] && so.accuracyDigits[0].visible) {
                const a = so.accuracyDigits[0];
                const aHeight = (a.knownwidth || 18) * 0.85; // approximate text height
                const gap = 10;
                this.pieCx = a.x - gap - this.pieRadius;
                this.pieCy = a.y + aHeight / 2;
            }

            // ── Pie-chart progress (clamped to [0,1]) ──
            const total = Math.max(1, this.endtime - this.starttime);
            const progress = (time - this.starttime) / total;
            this._drawPie(progress);

            // ── Combo, bottom-left, only when ≥ 1 ──
            const c = so && so.combo4display
                ? Math.round(so.combo4display.valueAt(time))
                : 0;
            const wantsComboVisible = c >= 1;
            if (wantsComboVisible) {
                this.combo.text = c + "x";
                const boost = Math.min(1.25, 1 + Math.log10(Math.max(1, c)) * 0.10);
                this.combo.scale.set(boost);
                this._comboTargetAlpha = 1;
            } else {
                this._comboTargetAlpha = 0;
            }
            // Smoothly approach the target alpha (independent from the global HUD fade).
            this.combo._localAlpha = (this.combo._localAlpha == null ? 0 : this.combo._localAlpha);
            this.combo._localAlpha += (this._comboTargetAlpha - this.combo._localAlpha) * 0.18;

            // ── Global HUD fade-in / fade-out ──
            // Fade IN over the first 1500 ms after starttime.
            // Fade OUT over the last 1500 ms before endtime.
            const fadeIn = 1500, fadeOut = 1500;
            let hudAlpha = 1;
            if (time < this.starttime) {
                hudAlpha = 0;
            } else if (time < this.starttime + fadeIn) {
                hudAlpha = (time - this.starttime) / fadeIn;
            } else if (time > this.endtime - fadeOut) {
                hudAlpha = Math.max(0, (this.endtime - time) / fadeOut);
            }
            // Smooth easing (cubic) for pleasant in/out.
            hudAlpha = hudAlpha * hudAlpha * (3 - 2 * hudAlpha);

            this.alpha = hudAlpha;
            // Apply the same fade to the score overlay and the hit-error meter.
            if (so) so.alpha = hudAlpha;
            const scene = window.game && window.game.scene;
            if (scene && scene.errorMeter) scene.errorMeter.alpha = hudAlpha;

            // The combo's per-element alpha is multiplicative with the hud fade.
            this.combo.alpha = this.combo._localAlpha;
        }

        destroy(options) {
            super.destroy(options);
        }
    }

    return ProgressOverlay;
});
