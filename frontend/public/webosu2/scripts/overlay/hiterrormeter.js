/*
* class: ErrorMeterOverlay (extends PIXI.Container)
* Single horizontal hit-error meter pinned to the bottom-center of the screen.
*
* Construct params
*   windowfield: {width, height} in real pixels
*   r300, r100, r50: hit judgement window radius (in milliseconds)
*/

define([], function() {
    class ErrorMeter extends PIXI.Container {
        constructor(r300, r100, r50) {
            super();

            const barlength = 260;             // full bar length (pixels) — visual length
            const barthickness = 8;            // bar thickness (px)
            const color300 = 0x66ccff;
            const color100 = 0x88e066;
            const color50  = 0xffcc22;
            this.lscale = barlength / 2 / r50; // px per ms (along x in unrotated space)

            // Helper to create a horizontal bar piece. The original engine drew
            // these vertically, so we orient them horizontally here: width = ms
            // window mapped to pixels, height = barthickness.
            const newbarpiece = (length, tint, alpha = 0.85) => {
                const piece = new PIXI.Sprite(Skin["errormeterbar.png"]);
                piece.width = length;
                piece.height = barthickness;
                piece.tint = tint;
                piece.alpha = alpha;
                piece.anchor.set(0.5);
                piece.x = 0;
                piece.y = 0;
                return piece;
            };

            // 50 (yellow) is the longest/widest, 100 sits on top, 300 on top of that.
            this.addChild(newbarpiece(barlength, color50, 0.85));
            this.addChild(newbarpiece(barlength * r100 / r50, color100, 0.9));
            this.addChild(newbarpiece(barlength * r300 / r50, color300, 0.95));

            // Center reference line (vertical tick at the perfect-hit position).
            const centerline = new PIXI.Sprite(Skin["errormeterbar.png"]);
            centerline.width = 2;
            centerline.height = barthickness * 2.2;
            centerline.anchor.set(0.5);
            centerline.tint = 0xffffff;
            centerline.alpha = 0.95;
            this.addChild(centerline);

            // Average-hit indicator (small arrow above the bar).
            this.avgmarker = new PIXI.Sprite(Skin["reversearrow.png"]);
            this.avgmarker.scale.set(0.08);
            this.avgmarker.anchor.set(0.5);
            this.avgmarker.rotation = Math.PI / 2; // point downward toward the bar
            this.avgmarker.x = 0;
            this.avgmarker.y = -barthickness - 4;
            this.addChild(this.avgmarker);

            // Pool of tick sprites — each hit drops a fading vertical tick on the bar.
            this.ticks = [];
            this.poolsize = 24;
            for (let i = 0; i < this.poolsize; ++i) {
                const tick = new PIXI.Sprite(Skin["errormeterindicator.png"]);
                tick.scale.set(0.18);
                tick.anchor.set(0.5, 0);
                tick.alpha = 0;
                tick.t0 = -23333;
                tick.y = -barthickness / 2;
                tick.rotation = Math.PI / 2; // make the indicator vertical relative to the horizontal bar
                this.ticks.push(tick);
                this.addChild(tick);
            }
            this.poolptr = 0;
            this.avgerror = 0;
        }

        update(time) {
            for (let i = 0; i < this.poolsize; ++i) {
                this.ticks[i].alpha = Math.exp(-(time - this.ticks[i].t0) / 1200);
            }
        }

        hit(hiterror, time) {
            const tick = this.ticks[this.poolptr];
            this.poolptr = (this.poolptr + 1) % this.poolsize;
            tick.t0 = time;
            // Negative error = hit early (left), positive = hit late (right).
            tick.x = hiterror * this.lscale;
            tick.y = -2;
            this.avgerror = this.avgerror * 0.9 + hiterror * 0.1;
            this.avgmarker.x = this.avgerror * this.lscale;
        }
    }

    class ErrorMeterOverlay extends PIXI.Container {
        constructor(windowfield, r300, r100, r50) {
            super();
            this.bar = new ErrorMeter(r300, r100, r50);
            this.record = [];
            this.addChild(this.bar);
            this.resize(windowfield);
        }

        resize(windowfield) {
            // Centered horizontally, pinned ~64px from the bottom so it doesn't
            // crowd the bottom-left combo counter or the screen edge.
            this.bar.x = windowfield.width / 2;
            this.bar.y = windowfield.height - 64;
        }

        hit(hiterror, time) {
            this.bar.hit(hiterror, time);
            this.record.push(hiterror);
        }

        update(time) {
            this.bar.update(time);
        }

        destroy(options) {
            super.destroy(options);
        }
    }

    return ErrorMeterOverlay;
});
