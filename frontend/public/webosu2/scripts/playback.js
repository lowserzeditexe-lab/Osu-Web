/*
*   object layering:
*       assuming number of possible hits doesn't exceed 9998
*/
define(["osu", "playerActions", "SliderMesh", "overlay/score", "overlay/volume", "overlay/loading", "overlay/break", "overlay/progress", "overlay/hiterrormeter"],
    function (Osu, setPlayerActions, SliderMesh, ScoreOverlay, VolumeMenu, LoadingMenu, BreakOverlay, ProgressOverlay, ErrorMeterOverlay) {
        function clamp01(a) {
            return Math.min(1, Math.max(0, a));
        }
        function colorLerp(rgb1, rgb2, t) {
            let r = (1 - t) * ((rgb1 >> 16) / 255) + t * ((rgb2 >> 16) / 255);
            let g = (1 - t) * (((rgb1 >> 8) & 255) / 255) + t * (((rgb2 >> 8) & 255) / 255);
            let b = (1 - t) * ((rgb1 & 255) / 255) + t * ((rgb2 & 255) / 255);
            return Math.round(r * 255) << 16 | Math.round(g * 255) << 8 | Math.round(b * 255);
        }
        function repeatclamp(a) {
            a %= 2;
            return a > 1 ? 2 - a : a;
        }
        function Playback(game, osu, track) {
            var self = this;
            window.playback = this;
            self.game = game;
            self.osu = osu;
            self.track = track;
            self.background = null;
            self.started = false;
            self.upcomingHits = [];
            // creating a copy of hitobjects
            self.hits = [];
            _.each(self.track.hitObjects, function (o) {
                self.hits.push(Object.assign({}, o));
            });
            self.offset = 0;
            self.currentHitIndex = 0; // index for all hit objects
            self.ended = false;
            // Reset death state — without this, after a fail + retry the
            // `!this.dead` guard in the HP < 0 branch (~line 1436) stays
            // false forever and the death-detection never fires again,
            // giving the player accidental "godmode" on subsequent runs.
            self.dead = false;
            // Death-menu / falling-circle state — also reset so a 2nd
            // death cleanly re-triggers the cinematic instead of being
            // short-circuited by the previous run's flags.
            self.deathMenuShown = false;
            if (self.deathMenuTimer) {
                clearTimeout(self.deathMenuTimer);
                self.deathMenuTimer = null;
            }
            self.fallingObjects = null;
            self.showDeathMenuNow = null;
            // mods
            self.autoplay = game.autoplay;
            self.autopilot = game.autopilot;
            self.relax = game.relax;
            self.modhidden = game.hidden;
            self.flashlight = game.flashlight;
            self.nofail = game.nofail;
            self.sudden = game.sudden;
            self.perfect = game.perfect;
            self.playbackRate = 1.0;
            if (self.game.nightcore || self.game.doubletime) self.playbackRate *= 1.5;
            if (self.game.daycore || self.game.halftime) self.playbackRate *= 0.75;
            self.hideNumbers = game.hideNumbers;
            self.hideGreat = game.hideGreat;
            self.hideFollowPoints = game.hideFollowPoints;

            self.approachScale = 3;
            self.audioReady = false;
            self.endTime = self.hits[self.hits.length - 1].endTime + 1500;
            this.wait = Math.max(0, 1500 - this.hits[0].time);

            self.osu.onready = function () {
                self.loadingMenu.hide();
                self.audioReady = true;
                if (self.onload)
                    self.onload();
                self.start();
            }
            self.load = function () {
                self.osu.load_mp3(self.track);
            }

            var gfx = window.gfx = {}; // game field area
            self.gamefield = new PIXI.Container();

            // ── Flashlight mod: mask the gamefield with a circle around cursor ──
            // The mask is in osu! pixel coords (512x384), positioned each frame at
            // (game.mouseX, game.mouseY). Radius shrinks with combo (osu!stable):
            //   combo <100 → r=200  | 100..199 → r=160  | ≥200 → r=120  (osu! pixels)
            // Score / HP / combo overlays live on game.stage, not gamefield, so they
            // remain fully visible — the mask only hides hit objects.
            if (self.flashlight) {
                self.flashlightMask = new PIXI.Graphics();
                self.flashlightMask.beginFill(0xffffff);
                self.flashlightMask.drawCircle(0, 0, 200);
                self.flashlightMask.endFill();
                self.gamefield.addChild(self.flashlightMask);
                self.gamefield.mask = self.flashlightMask;
                // Optional: also dim the background so the field is dark outside the
                // FL circle. The gamefield's background is the global stage bg, so
                // we can darken it via tint elsewhere — keep simple for now.
            }
            self.calcSize = function () {
                gfx.width = game.window.innerWidth;
                gfx.height = game.window.innerHeight;
                if (gfx.width / 512 > gfx.height / 384)
                    gfx.width = gfx.height / 384 * 512;
                else
                    gfx.height = gfx.width / 512 * 384;
                gfx.width *= 0.8;
                gfx.height *= 0.8;
                gfx.xoffset = (game.window.innerWidth - gfx.width) / 2;
                gfx.yoffset = (game.window.innerHeight - gfx.height) / 2;
                self.gamefield.x = gfx.xoffset;
                self.gamefield.y = gfx.yoffset;
                self.gamefield.scale.set(gfx.width / 512);
            };
            self.calcSize();
            game.mouseX = 512 / 2;
            game.mouseY = 384 / 2;
            self.loadingMenu = new LoadingMenu({ width: game.window.innerWidth, height: game.window.innerHeight }, track);
            self.volumeMenu = new VolumeMenu({ width: game.window.innerWidth, height: game.window.innerHeight });
            self.breakOverlay = new BreakOverlay({ width: game.window.innerWidth, height: game.window.innerHeight });
            self.progressOverlay = new ProgressOverlay({ width: game.window.innerWidth, height: game.window.innerHeight }, this.hits[0].time - 1500, this.hits[this.hits.length - 1].endTime);

            window.onresize = function () {
                window.app.renderer.resize(window.innerWidth, window.innerHeight);
                if (self.audioReady) self.pause();
                self.calcSize();
                self.scoreOverlay.resize({ width: window.innerWidth, height: window.innerHeight });
                self.errorMeter.resize({ width: window.innerWidth, height: window.innerHeight });
                self.loadingMenu.resize({ width: window.innerWidth, height: window.innerHeight });
                self.volumeMenu.resize({ width: window.innerWidth, height: window.innerHeight });
                self.breakOverlay.resize({ width: window.innerWidth, height: window.innerHeight });
                self.progressOverlay.resize({ width: window.innerWidth, height: window.innerHeight });

                if (self.background && self.background.texture) {
                    self.background.x = window.innerWidth / 2;
                    self.background.y = window.innerHeight / 2;
                    self.background.scale.set(Math.max(window.innerWidth / self.background.texture.width, window.innerHeight / self.background.texture.height));
                }

                SliderMesh.prototype.resetTransform({
                    dx: 2 * gfx.width / window.innerWidth / 512,
                    ox: -1 + 2 * gfx.xoffset / window.innerWidth,
                    dy: -2 * gfx.height / window.innerHeight / 384,
                    oy: 1 - 2 * gfx.yoffset / window.innerHeight,
                });
            }

            var blurCallback = function (e) {
                if (self.audioReady)
                    self.pause();
            };
            window.addEventListener("blur", blurCallback);

            // deal with difficulties
            this.OD = track.difficulty.OverallDifficulty;
            this.CS = track.difficulty.CircleSize;
            this.AR = track.difficulty.ApproachRate;
            this.HP = track.difficulty.HPDrainRate;
            if (game.hardrock) {
                this.OD = Math.min(this.OD * 1.4, 10);
                this.CS = Math.min(this.CS * 1.3, 10);
                this.AR = Math.min(this.AR * 1.4, 10);
                this.HP = Math.min(this.HP * 1.4, 10);
            }
            if (game.easy) {
                this.OD = this.OD * 0.5;
                this.CS = this.CS * 0.5;
                this.AR = this.AR * 0.5;
                this.HP = this.HP * 0.5;
            }

            // ── Lose system (classic) ──────────────────────────────────
            // Per the user's request, HP changes ONLY come from hits:
            //   • miss          → HP -= 0.02 * HPdrain
            //   • 50 / 100 / 300 → HP += 0.01 * (n - HPdrain)   (positive at 300)
            // No passive time-based drain is applied — this is the classic
            // osu!web-clone behaviour where you can only fail by accumulating
            // missed notes (the harder the HPdrain, the fewer misses it takes).
            // We still parse the [Events] break sections in case future logic
            // wants them (e.g. a regen pulse during breaks).
            self.breaks = [];
            if (Array.isArray(self.track.events)) {
                for (var ei = 0; ei < self.track.events.length; ei++) {
                    var ev = self.track.events[ei];
                    if (!ev || ev.length < 3) continue;
                    var tag = String(ev[0]).trim();
                    if (tag === '2' || tag.toLowerCase() === 'break') {
                        var bs = +ev[1], be = +ev[2];
                        if (Number.isFinite(bs) && Number.isFinite(be) && be > bs) {
                            self.breaks.push({ startTime: bs, endTime: be });
                        }
                    }
                }
                self.breaks.sort(function (a, b) { return a.startTime - b.startTime; });
            }

            let scoreModMultiplier = 1.0;
            if (game.easy) scoreModMultiplier *= 0.50;
            if (game.nofail) scoreModMultiplier *= 0.50;
            if (game.daycore || game.halftime) scoreModMultiplier *= 0.30;
            if (game.hardrock) scoreModMultiplier *= 1.06;
            if (game.nightcore || game.doubletime) scoreModMultiplier *= 1.12;
            if (game.hidden) scoreModMultiplier *= 1.06;
            if (game.flashlight) scoreModMultiplier *= 1.12;

            // osu!stable difficulty multiplier (stepwise table on the modded
            // sum HP + CS + OD, used in the score formula):
            //   sum 0..5   → 2     6..12  → 3
            //   13..17     → 4     18..24 → 5
            //   25..30     → 6
            const _diffSum = this.HP + this.CS + this.OD;
            let diffMult = 2;
            if (_diffSum > 30) diffMult = 6;
            else if (_diffSum > 24) diffMult = 6;
            else if (_diffSum > 17) diffMult = 5;
            else if (_diffSum > 12) diffMult = 4;
            else if (_diffSum >  5) diffMult = 3;
            self.scoreOverlay = new ScoreOverlay({ width: game.window.innerWidth, height: game.window.innerHeight }, this.HP, scoreModMultiplier, diffMult, track);
            // Expose the score overlay globally so the ProgressOverlay can
            // read the live combo counter when it renders the bottom-left HUD.
            window.scoreOverlay = self.scoreOverlay;
            self.circleRadius = (109 - 9 * this.CS) / 2; // unit: osu! pixel
            self.hitSpriteScale = self.circleRadius / 60;
            self.MehTime = 200 - 10 * this.OD;
            self.GoodTime = 140 - 8 * this.OD;
            self.GreatTime = 80 - 6 * this.OD;
            self.errorMeter = new ErrorMeterOverlay({ width: game.window.innerWidth, height: game.window.innerHeight }, this.GreatTime, this.GoodTime, this.MehTime);
            self.approachTime = this.AR < 5 ? 1800 - 120 * this.AR : 1950 - 150 * this.AR; // time of sliders/hitcircles and approach circles approaching
            self.approachFadeInTime = Math.min(800, self.approachTime); // duration of approach circles fading in, at beginning of approaching
            for (let i = 0; i < self.hits.length; ++i) {
                let hit = self.hits[i];
                if (self.modhidden && (i > 0 && self.hits[i - 1].type != "spinner")) { // don't hide the first one
                    hit.objectFadeInTime = 0.4 * self.approachTime;
                    hit.objectFadeOutOffset = -0.6 * self.approachTime;
                    hit.circleFadeOutTime = 0.3 * self.approachTime;
                }
                else {
                    hit.enableflash = true;
                    hit.objectFadeInTime = Math.min(400, self.approachTime); // duration of sliders/hitcircles fading in, at beginning of approaching
                    hit.circleFadeOutTime = 100;
                    hit.objectFadeOutOffset = self.MehTime;
                }
            }

            for (let i = 0; i < self.hits.length; ++i) {
                if (self.hits[i].type == "slider") {
                    if (self.modhidden && (i > 0 && self.hits[i - 1].type != "spinner")) {
                        self.hits[i].fadeOutOffset = -0.6 * self.approachTime;
                        self.hits[i].fadeOutDuration = self.hits[i].sliderTimeTotal - self.hits[i].fadeOutOffset;
                    }
                    else {
                        self.hits[i].fadeOutOffset = self.hits[i].sliderTimeTotal;
                        self.hits[i].fadeOutDuration = 300;
                    }
                }
            }

            self.glowFadeOutTime = 350;
            self.glowMaxOpacity = 0.5;
            self.flashFadeInTime = 40;
            self.flashFadeOutTime = 120;
            self.flashMaxOpacity = 0.8;
            self.scoreFadeOutTime = 500;
            self.followZoomInTime = 100;
            self.followFadeOutTime = 100;
            self.ballFadeOutTime = 100;
            self.objectDespawnTime = 1500;
            self.backgroundFadeTime = 800;
            self.spinnerAppearTime = self.approachTime;
            self.spinnerZoomInTime = 300;
            self.spinnerFadeOutTime = 150;

            setPlayerActions(self);


            self.game.paused = false;
            this.pause = function () {
                if (this.osu.audio.pause()) { // pause music success
                    this.game.paused = true;
                    let menu = document.getElementById("pause-menu");
                    menu.removeAttribute("hidden");
                    btn_continue = document.getElementById("pausebtn-continue");
                    btn_retry = document.getElementById("pausebtn-retry");
                    btn_quit = document.getElementById("pausebtn-quit");
                    btn_continue.onclick = function () {
                        self.resume();
                        btn_continue.onclick = null;
                        btn_retry.onclick = null;
                        btn_quit.onclick = null;
                    }
                    btn_retry.onclick = function () {
                        self.game.paused = false;
                        menu.setAttribute("hidden", "");
                        self.retry();
                    }
                    btn_quit.onclick = function () {
                        self.game.paused = false;
                        menu.setAttribute("hidden", "");
                        self.quit();
                    }
                }
            };
            this.resume = function () {
                this.osu.audio.play();
                this.game.paused = false;
                document.getElementById("pause-menu").setAttribute("hidden", "");
            };

            // adjust volume
            var wheelCallback;
            if (game.allowMouseScroll) {
                wheelCallback = function (e) {
                    self.game.masterVolume -= e.deltaY * 0.002;
                    if (self.game.masterVolume < 0) {
                        self.game.masterVolume = 0;
                    }
                    if (self.game.masterVolume > 1) {
                        self.game.masterVolume = 1;
                    }
                    self.osu.audio.gain.gain.value = self.game.musicVolume * self.game.masterVolume;
                    self.volumeMenu.setVolume(self.game.masterVolume * 100);
                };
                window.addEventListener('wheel', wheelCallback);
            }

            // Robust Esc detection: keyCode is deprecated and some browsers
            // (and synthesised KeyboardEvents from the parent React frame)
            // drop it to 0. Accept the modern e.key === 'Escape' too so the
            // pause / death-menu branches reliably fire even when the
            // iframe doesn't have native keyboard focus.
            var isEscKey = function (e) {
                return (
                    e.keyCode === game.ESCkeycode
                    || e.keyCode == game.ESC2keycode
                    || e.key === 'Escape'
                    || e.code === 'Escape'
                );
            };

            var pauseKeyCallback = function (e) {
                // While dying we INTENTIONALLY ignore Esc so the user
                // can't disrupt the death sequence (the death menu pops
                // automatically once the 2.5 s animation finishes).
                if (self.dead) return;
                // press esc to pause
                if (isEscKey(e) && !self.game.paused) {
                    self.pause();
                    self.pausing = true; // to prevent resuming at end of first key press
                }
            };
            var resumeKeyCallback = function (e) {
                // press and release esc to pause
                if (isEscKey(e) && self.game.paused) {
                    if (self.pausing)
                        self.pausing = false;
                    else
                        self.resume();
                }
            }
            window.addEventListener("keydown", pauseKeyCallback);
            window.addEventListener("keyup", resumeKeyCallback);


            this.fadeOutEasing = function (t) { // [0..1] -> [1..0]
                if (t <= 0) return 1;
                if (t > 1) return 0;
                return 1 - Math.sin(t * Math.PI / 2);
            }


            function judgementText(points) {
                switch (points) {
                    case 0: return "miss";
                    case 50: return "meh";
                    case 100: return "good";
                    case 300: return "great";
                    default: throw "no such judgement";
                }
            }
            function judgementColor(points) {
                switch (points) {
                    case 0: return 0xed1121;
                    case 50: return 0xffcc22;
                    case 100: return 0x88b300;
                    case 300: return 0x66ccff;
                    default: throw "no such judgement";
                }
            }

            this.createJudgement = function (x, y, depth, finalTime) {
                let judge = new PIXI.BitmapText('', { fontName: 'Venera', fontSize: 20, });
                judge.anchor.set(0.5);
                judge.scale.set(0.85 * this.hitSpriteScale, 1 * this.hitSpriteScale);
                judge.visible = false;
                judge.basex = judge.x = x;
                judge.basey = judge.y = y;
                judge.depth = depth;
                judge.points = -1;
                judge.finalTime = finalTime;
                judge.defaultScore = 0;
                return judge;
            }

            this.invokeJudgement = function (judge, points, time) {
                judge.visible = true;
                judge.points = points;
                judge.t0 = time;
                if (!this.hideGreat || points != 300)
                    judge.text = judgementText(points);
                judge.tint = judgementColor(points);
                this.updateJudgement(judge, time);
            }

            this.updateJudgement = function (judge, time) // set transform of judgement text
            {
                if (judge.points < 0 && time >= judge.finalTime) // miss
                {
                    if (judge.isSliderHead) {
                        // Slider head missed by timeout. Don't count it as
                        // accuracy here — the slider's overall accuracy is
                        // committed once at the end via commitAccuracy().
                        // Still award the (zero) score & break combo via
                        // hitTick so HP/UI behave consistently.
                        this.scoreOverlay.hitTick(0, time);
                        this.invokeJudgement(judge, 0, time);
                        return;
                    }
                    if (judge.isSliderEdge) {
                        // Slider repeat/end missed by timeout. The very last
                        // edge ("slider end") does NOT break combo per
                        // osu!stable; intermediate repeats do.
                        const breakCombo = !judge.isSliderEnd;
                        this.scoreOverlay.hitTick(0, time, breakCombo);
                        this.invokeJudgement(judge, 0, time);
                        return;
                    }
                    this.scoreOverlay.hit(judge.defaultScore, 300, time);
                    this.invokeJudgement(judge, judge.defaultScore, time);
                    return;
                }
                if (!judge.visible) return;

                let t = time - judge.t0;

                if (judge.points == 0) // miss
                {
                    if (t > 800) {
                        judge.visible = false;
                        return;
                    }
                    judge.alpha = (t < 100) ? t / 100 : (t < 600) ? 1 : 1 - (t - 600) / 200;
                    judge.y = judge.basey + 100 * Math.pow(t / 800, 5) * this.hitSpriteScale;
                    judge.rotation = 0.7 * Math.pow(t / 800, 5);
                }
                else // meh, good, great
                {
                    if (t > 500) {
                        judge.visible = false;
                        return;
                    }
                    judge.alpha = (t < 100) ? t / 100 : 1 - (t - 100) / 400;
                    judge.letterSpacing = 70 * (Math.pow(t / 1800 - 1, 5) + 1);
                }
            }

            this.createBackground = function () {
                
                // Load background if possible
                function loadBackground(uri) {
                    // if the URI starts with blob:, use Texture.from
                    if (uri.startsWith("blob:")) {
                        let texture = PIXI.Texture.from(uri);
                        if (!texture.baseTexture.valid) {
                            texture.baseTexture.once("loaded", () => buildBackground(texture));
                        } else {
                            buildBackground(texture);
                        }
                    }
                    // Else use the Assets API
                    else {
                        PIXI.Assets.load(uri)
                            .then(texture => buildBackground(texture))
                            .catch(err => {
                                console.error("Error loading background:", err);
                                loadBackground("skin/defaultbg.jpg"); // fallback
                            });
                    }
                }

                function buildBackground(texture) {
                    console.log("Texture:", texture.width, texture.height, texture.baseTexture.valid);
                    if (!texture || !texture.baseTexture.valid) {
                        console.error("Error: Loaded texture is invalid", texture);
                        return;
                    }
                    // Create the background sprite directly from the texture.
                    let sprite = new PIXI.Sprite(texture);
                    // Optionally apply blur if enabled
                    if (self.game.backgroundBlurRate > 0.0001) {
                        let blurFilter = new PIXI.filters.BlurFilter();
                        blurFilter.blur = self.game.backgroundBlurRate;
                        sprite.filters = [blurFilter];
                    }
                    // Use the sprite directly as the background.
                    self.background = sprite;
                    self.background.anchor.set(0.5);
                    self.background.x = window.innerWidth / 2;
                    self.background.y = window.innerHeight / 2;
                    // Scale the background to cover the viewport.
                    self.background.scale.set(
                        Math.max(window.innerWidth / texture.width, window.innerHeight / texture.height)
                    );
                    self.game.stage.addChildAt(self.background, 0);
                }
                if (self.track.events.length != 0) {
                    var file = self.track.events[0][2];
                    if (track.events[0][0] === "Video") {
                        file = self.track.events[1][2];
                    }
                    file = file.substr(1, file.length - 2);
                    entry = osu.zip.getChildByName(file);
                    if (entry) {
                        entry.getBlob("image/jpeg", function (blob) {
                            const reader = new FileReader();
                            reader.onload = function(e) {
                                // Now e.target.result is a data URL
                                loadBackground(e.target.result);
                            }
                            reader.readAsDataURL(blob);
                        });
                    } else {
                        loadBackground("skin/defaultbg.jpg");
                    }
                } else {
                    loadBackground("skin/defaultbg.jpg");
                }
            };
            self.createBackground();

            // load combo colors
            function convertcolor(color) {
                return ((+color[0]) << 16) | ((+color[1]) << 8) | ((+color[2]) << 0);
            }
            var combos = [];
            for (var i = 0; i < track.colors.length; i++) {
                combos.push(convertcolor(track.colors[i]));
            }
            var SliderTrackOverride;
            var SliderBorder;
            // leave them undefined if they're undefined in the beatmap
            if (track.colors.SliderTrackOverride)
                SliderTrackOverride = convertcolor(track.colors.SliderTrackOverride);
            if (track.colors.SliderBorder)
                SliderBorder = convertcolor(track.colors.SliderBorder);

            self.game.stage.addChild(this.gamefield);
            self.game.stage.addChild(this.scoreOverlay);
            self.game.stage.addChild(this.errorMeter);
            self.game.stage.addChild(this.progressOverlay);
            self.game.stage.addChild(this.breakOverlay);
            self.game.stage.addChild(this.volumeMenu);
            self.game.stage.addChild(this.loadingMenu);

            // creating hit objects
            this.createHitCircle = function (hit) {

                function newHitSprite(spritename, depth, scalemul = 1, anchorx = 0.5, anchory = 0.5) {
                    let sprite = new PIXI.Sprite(Skin[spritename]);
                    sprite.initialscale = self.hitSpriteScale * scalemul;
                    sprite.scale.x = sprite.scale.y = sprite.initialscale;
                    sprite.anchor.x = anchorx;
                    sprite.anchor.y = anchory;
                    sprite.x = hit.x;
                    sprite.y = hit.y;
                    sprite.depth = depth;
                    sprite.alpha = 0;
                    hit.objects.push(sprite);
                    return sprite;
                }
                let index = hit.index + 1;
                let basedep = 4.9999 - 0.0001 * hit.hitIndex;

                hit.base = newHitSprite("disc.png", basedep, 0.5);
                hit.base.tint = combos[hit.combo % combos.length];

                hit.circle = newHitSprite("hitcircleoverlay.png", basedep, 0.5);
                hit.glow = newHitSprite("ring-glow.png", basedep + 2, 0.46);
                hit.glow.tint = combos[hit.combo % combos.length];
                hit.glow.blendMode = PIXI.BLEND_MODES.ADD;
                hit.burst = newHitSprite("hitburst.png", 8.00005 + 0.0001 * hit.hitIndex);
                hit.burst.visible = false;

                hit.approach = newHitSprite("approachcircle.png", 8 + 0.0001 * hit.hitIndex);
                hit.approach.tint = combos[hit.combo % combos.length];

                hit.judgements.push(this.createJudgement(hit.x, hit.y, 10, hit.time + this.MehTime));

                // create combo number
                hit.numbers = [];
                if (index <= 9) {
                    hit.numbers.push(newHitSprite("score-" + index + ".png", basedep, 0.4, 0.5, 0.47));
                } else if (index <= 99) {
                    hit.numbers.push(newHitSprite("score-" + (index % 10) + ".png", basedep, 0.35, 0, 0.47));
                    hit.numbers.push(newHitSprite("score-" + ((index - (index % 10)) / 10) + ".png", basedep, 0.35, 1, 0.47));
		} else if (index <= 999) {
                    hit.numbers.push(newHitSprite("score-" + (index % 10) + ".png", basedep, 0.3, -0.5, 0.47));
	            hit.numbers.push(newHitSprite("score-" + (((index % 100) - (index % 10)) / 10) + ".png", basedep, 0.3, 0.5, 0.47));
	            hit.numbers.push(newHitSprite("score-" + ((index - (index % 100)) / 100) + ".png", basedep, 0.3, 1.5, 0.47));
                }
                // Note: combos > 999 hits are unsupported
            }

            this.createSlider = function (hit) {
                hit.lastrep = 0; // for current-repeat counting
                hit.nexttick = 0; // for tick hit counting

                // create slider body
                // manually set transform osupixel -> gl coordinate

                var body = hit.body = new SliderMesh(hit.curve, this.circleRadius, hit.combo % combos.length);
                body.alpha = 0;
                body.depth = 4.9999 - 0.0001 * hit.hitIndex;
                hit.objects.push(body);

                function newSprite(spritename, x, y, scalemul = 1, reverseArr) {
                    let sprite = new PIXI.Sprite(Skin[spritename]);
                    sprite.scale.set(self.hitSpriteScale * scalemul);
                    sprite.anchor.set(0.5);
                    sprite.x = x;
                    sprite.y = y;
                    sprite.depth = (reverseArr ? 9.9999 : 4.9999) - 0.0001 * hit.hitIndex;
                    sprite.alpha = 0;
                    hit.objects.push(sprite);
                    return sprite;
                }

                // add slider ticks
                hit.ticks = [];
                let tickDuration = hit.timing.trueMillisecondsPerBeat / this.track.difficulty.SliderTickRate;
                let nticks = Math.floor(hit.sliderTimeTotal / tickDuration) + 1;
                for (let i = 0; i < nticks; ++i) {
                    let t = hit.time + i * tickDuration;
                    // Question: are ticks offset to the slider start or its timing point?
                    let pos = repeatclamp(i * tickDuration / hit.sliderTime);
                    if (Math.min(pos, 1 - pos) * hit.sliderTime <= 10) // omit ticks near slider end (within 10ms)
                        continue;
                    let at = hit.curve.pointAt(pos);
                    hit.ticks.push(newSprite("sliderscorepoint.png", at.x, at.y));
                    hit.ticks[hit.ticks.length - 1].appeartime = t - 2 * tickDuration;
                    hit.ticks[hit.ticks.length - 1].time = t;
                    hit.ticks[hit.ticks.length - 1].result = false;
                }

                // add reverse symbol
                if (hit.repeat > 1) {
                    // curve points are of about-same distance, so these 2 points should be different
                    let p = hit.curve.curve[hit.curve.curve.length - 1];
                    let p2 = hit.curve.curve[hit.curve.curve.length - 2];
                    hit.reverse = newSprite("reversearrow.png", p.x, p.y, 0.36, true);
                    hit.reverse.rotation = Math.atan2(p2.y - p.y, p2.x - p.x);
                }
                if (hit.repeat > 2) {
                    // curve points are of about-same distance, so these 2 points should be different
                    let p = hit.curve.curve[0];
                    let p2 = hit.curve.curve[1];
                    hit.reverse_b = newSprite("reversearrow.png", p.x, p.y, 0.36, true);
                    hit.reverse_b.rotation = Math.atan2(p2.y - p.y, p2.x - p.x);
                    hit.reverse_b.visible = false; // Only visible when it's the next end to hit
                }

                // Add follow circle (above slider body)
                hit.follow = newSprite("sliderfollowcircle.png", hit.x, hit.y);
                hit.follow.visible = false;
                hit.follow.blendMode = PIXI.BLEND_MODES.ADD;
                hit.followSize = 1; // [1,2] current follow circle size relative to hitcircle

                // Add slider ball (above follow circle)
                hit.ball = newSprite("sliderb.png", hit.x, hit.y, 0.5);
                hit.ball.visible = false;

                // A slider contains a complete hit circle at its start, so we just make use of this
                self.createHitCircle(hit);

                // add judgement objects at edge
                let endPoint = hit.curve.curve[hit.curve.curve.length - 1];
                for (let i = 1; i <= hit.repeat; ++i) {
                    let x = (i % 2 == 1) ? endPoint.x : hit.x;
                    let y = (i % 2 == 1) ? endPoint.y : hit.y;
                    hit.judgements.push(this.createJudgement(x, y, 4, hit.time + i * hit.sliderTime));
                }

                // ── osu!stable slider element tracking ────────────────
                // The slider's final accuracy judgement (300/100/50/Miss) is
                // computed once at the end from the % of components that were
                // successfully hit. Components: head + each tick + each
                // repeat/end edge.
                hit.judgements[0].isSliderHead = true;
                for (let i = 1; i < hit.judgements.length; ++i) {
                    hit.judgements[i].isSliderEdge = true;
                    hit.judgements[i].isSliderEnd  = (i === hit.repeat); // last edge only
                }
                hit.elementsHit   = 0;
                hit.elementsTotal = 1 + hit.ticks.length + hit.repeat;
                hit.finalJudged   = false;
                hit.headJudged    = false;
            }

            this.createSpinner = function (hit) {
                hit.approachTime = self.spinnerAppearTime + self.spinnerZoomInTime;
                hit.x = 512 / 2;
                hit.y = 384 / 2;
                // absolute position
                hit.rotation = 0;
                hit.rotationProgress = 0;
                hit.clicked = false;
                let spinRequiredPerSec = this.OD < 5 ? 3 + 0.4 * this.OD : 2.5 + 0.5 * this.OD;
                spinRequiredPerSec *= 0.7; // make it easier
                hit.rotationRequired = 2 * Math.PI * spinRequiredPerSec * (hit.endTime - hit.time) / 1000;

                function newsprite(spritename) {
                    var sprite = new PIXI.Sprite(Skin[spritename]);
                    sprite.anchor.set(0.5);
                    sprite.x = hit.x;
                    sprite.y = hit.y;
                    sprite.depth = 4.9999 - 0.0001 * (hit.hitIndex || 1);
                    sprite.alpha = 0;
                    hit.objects.push(sprite);
                    return sprite;
                }
                hit.base = newsprite("spinnerbase.png");
                hit.progress = newsprite("spinnerprogress.png");
                hit.top = newsprite("spinnertop.png");
                if (this.modhidden) {
                    hit.progress.visible = false;
                    hit.base.visible = false;
                }

                hit.judgements.push(this.createJudgement(hit.x, hit.y, 4, hit.endTime + 233));
            }

            // create a follow point connection between two hit objects & store it in the latter object
            // this should be called after these hit objects be initialized, but before they're added to the stage
            this.createFollowPoint = function (hitBefore, hit) {
                var x1 = hitBefore.x;
                var y1 = hitBefore.y;
                var t1 = hitBefore.time;
                if (hitBefore.type == "slider") {
                    t1 += hitBefore.sliderTimeTotal;
                    if (hitBefore.repeat % 2 == 1) {
                        x1 = hitBefore.curve.curve[hitBefore.curve.curve.length - 1].x;
                        y1 = hitBefore.curve.curve[hitBefore.curve.curve.length - 1].y;
                    }
                }
                var container = new PIXI.Container();
                container.depth = 3;
                container.x1 = x1;
                container.y1 = y1;
                container.t1 = t1;
                container.dx = hit.x - x1;
                container.dy = hit.y - y1;
                container.dt = hit.time - t1;
                container.preempt = this.approachTime;
                container.hit = hit;
                hit.objects.push(container);
                hit.followPoints = container;

                const spacing = this.circleRadius * 0.7;
                const rotation = Math.atan2(container.dy, container.dx);
                const distance = Math.hypot(container.dx, container.dy);
                for (let d = spacing * 2; d < distance - 1.5 * spacing; d += spacing) {
                    let p = new PIXI.Sprite(Skin["followpoint.png"]);
                    p.scale.set(this.hitSpriteScale * 0.3);
                    p.x = x1 + container.dx * d / distance;
                    p.y = y1 + container.dy * d / distance;
                    p.blendMode = PIXI.BLEND_MODES.ADD;
                    p.rotation = rotation;
                    p.anchor.set(0.5);
                    p.alpha = 0;
                    p.fraction = d / distance; // store for convenience
                    container.addChild(p);
                }
            }

            this.populateHit = function (hit) {
                // Creates PIXI objects for a given hit
                this.currentHitIndex += 1;
                hit.hitIndex = this.currentHitIndex;
                hit.objects = [];
                hit.judgements = [];
                hit.score = -1;
                switch (hit.type) {
                    case "circle":
                        self.createHitCircle(hit);
                        break;
                    case "slider":
                        self.createSlider(hit);
                        break;
                    case "spinner":
                        self.createSpinner(hit);
                        break;
                }
            }

            this.updateCursorPredictVisualizer = function () {
                if (!this.predictVisualizer && game.mouse) {
                    // create visualizer
                    let o = this.predictVisualizer = new PIXI.Sprite(Skin["sliderb.png"]);
                    o.anchor.set(0.5);
                    o.tint = 0x00ff00;
                    this.gamefield.addChild(o);
                }
                if (this.predictVisualizer) {
                    let res = game.mouse(new Date().getTime()); // prediction result
                    this.predictVisualizer.x = res.x;
                    this.predictVisualizer.y = res.y;
                    this.predictVisualizer.scale.set(res.r / 120);
                    this.predictVisualizer.bringToFront();
                }
            }

            SliderMesh.prototype.initialize(combos, this.circleRadius, {
                dx: 2 * gfx.width / window.innerWidth / 512,
                ox: -1 + 2 * gfx.xoffset / window.innerWidth,
                dy: -2 * gfx.height / window.innerHeight / 384,
                oy: 1 - 2 * gfx.yoffset / window.innerHeight,
            }, SliderTrackOverride, SliderBorder); // prepare sliders
            for (let i = 0; i < this.hits.length; i++) {
                this.populateHit(this.hits[i]); // Prepare sprites and such
            }
            if (this.modhidden) {
                for (let i = 0; i < this.hits.length; i++) {
                    if (this.hits[i].approach && (i > 0 && this.hits[i - 1].type != "spinner"))
                        this.hits[i].approach.visible = false;
                }
            }
            if (this.hideNumbers) {
                for (let i = 0; i < this.hits.length; i++) {
                    if (this.hits[i].numbers) {
                        for (let j = 0; j < this.hits[i].numbers.length; ++j)
                            this.hits[i].numbers[j].visible = false;
                    }
                }
            }
            for (let i = 0; i < this.hits.length - 1; i++) {
                if (this.hits[i].type != "spinner" && this.hits[i + 1].type != "spinner" && this.hits[i + 1].combo == this.hits[i].combo)
                    this.createFollowPoint(this.hits[i], this.hits[i + 1]);
            }
            if (this.hideFollowPoints) {
                for (let i = 0; i < this.hits.length; i++) {
                    if (this.hits[i].followPoints) {
                        this.hits[i].followPoints.visible = false;
                    }
                }
            }

            // hit result handling
            // use separate timing for hitsounds, since volume may change inside a slider or spinner
            // note: time is expected time of object hit, not real time
            this.curtimingid = 0;
            this.playTicksound = function playTicksound(hit, time) {
                while (this.curtimingid + 1 < this.track.timingPoints.length && this.track.timingPoints[this.curtimingid + 1].offset <= time)
                    this.curtimingid++;
                while (this.curtimingid > 0 && this.track.timingPoints[this.curtimingid].offset > time)
                    this.curtimingid--;
                let timing = this.track.timingPoints[this.curtimingid];
                let volume = self.game.masterVolume * self.game.effectVolume * (hit.hitSample.volume || timing.volume) / 100;
                let defaultSet = timing.sampleSet || self.game.sampleSet;
                self.game.sample[defaultSet].slidertick.volume = volume;
                self.game.sample[defaultSet].slidertick.play();
            };
            this.playHitsound = function playHitsound(hit, id, time) {
                while (this.curtimingid + 1 < this.track.timingPoints.length && this.track.timingPoints[this.curtimingid + 1].offset <= time)
                    this.curtimingid++;
                while (this.curtimingid > 0 && this.track.timingPoints[this.curtimingid].offset > time)
                    this.curtimingid--;
                let timing = this.track.timingPoints[this.curtimingid];
                let volume = self.game.masterVolume * self.game.effectVolume * (hit.hitSample.volume || timing.volume) / 100;
                let defaultSet = timing.sampleSet || self.game.sampleSet;
                function playHit(bitmask, normalSet, additionSet) {
                    // The normal sound is always played
                    self.game.sample[normalSet].hitnormal.volume = volume;
                    self.game.sample[normalSet].hitnormal.play();
                    if (bitmask & 2) {
                        self.game.sample[additionSet].hitwhistle.volume = volume;
                        self.game.sample[additionSet].hitwhistle.play();
                    }
                    if (bitmask & 4) {
                        self.game.sample[additionSet].hitfinish.volume = volume;
                        self.game.sample[additionSet].hitfinish.play();
                    }
                    if (bitmask & 8) {
                        self.game.sample[additionSet].hitclap.volume = volume;
                        self.game.sample[additionSet].hitclap.play();
                    }
                }
                if (hit.type == 'circle' || hit.type == 'spinner') {
                    let toplay = hit.hitSound;
                    let normalSet = hit.hitSample.normalSet || defaultSet;
                    let additionSet = hit.hitSample.additionSet || normalSet;
                    playHit(toplay, normalSet, additionSet);
                }
                if (hit.type == 'slider') {
                    let toplay = hit.edgeHitsounds[id];
                    let normalSet = hit.edgeSets[id].normalSet || defaultSet;
                    let additionSet = hit.edgeSets[id].additionSet || normalSet;
                    playHit(toplay, normalSet, additionSet);
                }
            };

            this.hitSuccess = function hitSuccess(hit, points, time) {
                if (hit.type == "slider") {
                    // ── osu!stable: slider HEAD scoring ───────────────
                    // The head awards score & combo (and HP) but does NOT
                    // contribute to accuracy on its own — the slider's
                    // overall 300/100/50/Miss judgement is committed once
                    // at the end via commitAccuracy(). We therefore route
                    // through hitTick() instead of scoreOverlay.hit().
                    // Head still uses circle hit windows (300/100/50) so
                    // the player gets a visual judgement at the head, and
                    // the head counts as 1 element toward the % hit.
                    this.scoreOverlay.hitTick(points, time);
                    self.playHitsound(hit, 0, hit.time);
                    self.errorMeter.hit(time - hit.time, time);
                    if (points > 0) {
                        hit.elementsHit++;
                        // special rule: only missing slider end will not
                        // result in a full miss for the slider end edge.
                        hit.judgements[hit.judgements.length - 1].defaultScore = 50;
                    }
                    hit.headJudged = true;
                    hit.score = points;
                    hit.clickTime = time;
                    self.invokeJudgement(hit.judgements[0], points, time);
                    return;
                }
                this.scoreOverlay.hit(points, 300, time);
                if (points > 0) {
                    if (hit.type == "spinner")
                        self.playHitsound(hit, 0, hit.endTime); // hit happen at end of spinner
                    else {
                        self.playHitsound(hit, 0, hit.time);
                        self.errorMeter.hit(time - hit.time, time);
                    }
                }
                hit.score = points;
                hit.clickTime = time;
                self.invokeJudgement(hit.judgements[0], points, time);
            };

            // hit object updating
            var futuremost = 0, current = 0;
            if (self.track.hitObjects.length > 0) {
                futuremost = self.track.hitObjects[0].time;
            }
            var waitinghitid = 0; // the first object that's not ended
            this.updateUpcoming = function (time) {
                while (waitinghitid < self.hits.length && self.hits[waitinghitid].endTime < time)
                    waitinghitid++;
                function findindex(i) { // returning smallest j satisfying (self.gamefield.children[j].depth || 0)>=i
                    let l = 0, r = self.gamefield.children.length;
                    while (l + 1 < r) {
                        let m = Math.floor((l + r) / 2) - 1;
                        if ((self.gamefield.children[m].depth || 0) < i)
                            l = m + 1;
                        else
                            r = m + 1;
                    }
                    return l;
                }
                // Cache hit objects in the next 3 seconds
                while (current < self.hits.length && futuremost < time + 3000) {
                    var hit = self.hits[current++];
                    for (let i = hit.judgements.length - 1; i >= 0; i--) {
                        self.gamefield.addChildAt(hit.judgements[i], findindex(hit.judgements[i].depth || 0.0001));
                    }
                    for (let i = hit.objects.length - 1; i >= 0; i--) {
                        self.gamefield.addChildAt(hit.objects[i], findindex(hit.objects[i].depth || 0.0001));
                    }
                    self.upcomingHits.push(hit);
                    if (hit.time > futuremost) {
                        futuremost = hit.time;
                    }
                }
                for (var i = 0; i < self.upcomingHits.length; i++) {
                    var hit = self.upcomingHits[i];
                    var diff = hit.time - time;
                    var despawn = -this.objectDespawnTime;
                    if (hit.type === "slider") {
                        despawn -= hit.sliderTimeTotal;
                    }
                    if (hit.type === "spinner") {
                        despawn -= hit.endTime - hit.time;
                    }
                    if (diff < despawn) {
                        self.upcomingHits.splice(i, 1);
                        i--;
                        _.each(hit.objects, function (o) { self.gamefield.removeChild(o); o.destroy(); });
                        _.each(hit.judgements, function (o) { self.gamefield.removeChild(o); o.destroy(); });
                        hit.destroyed = true;
                    }
                }
            }

            // this should be called on a follow point connection every frame when it's valid
            this.updateFollowPoints = function (f, time) {
                for (let i = 0; i < f.children.length; ++i) {
                    let o = f.children[i];
                    let startx = f.x1 + (o.fraction - 0.1) * f.dx;
                    let starty = f.y1 + (o.fraction - 0.1) * f.dy;
                    let endx = f.x1 + o.fraction * f.dx;
                    let endy = f.y1 + o.fraction * f.dy;
                    let fadeOutTime = f.t1 + o.fraction * f.dt;
                    let fadeInTime = fadeOutTime - f.preempt;
                    let relpos = clamp01((time - fadeInTime) / f.hit.objectFadeInTime);
                    relpos *= 2 - relpos; // ease out
                    o.x = startx + (endx - startx) * relpos;
                    o.y = starty + (endy - starty) * relpos;
                    o.alpha = 0.5 * ((time < fadeOutTime) ? clamp01((time - fadeInTime) / f.hit.objectFadeInTime) : 1 - clamp01((time - fadeOutTime) / f.hit.objectFadeInTime));
                }
            }

            this.updateHitCircle = function (hit, time) {
                if (hit.followPoints)
                    this.updateFollowPoints(hit.followPoints, time);
                let diff = hit.time - time; // milliseconds before time of circle
                // update approach circle
                let approachFullAppear = this.approachTime - this.approachFadeInTime; // duration of opaque approach circle when approaching
                if (diff <= this.approachTime && diff > 0) { // approaching
                    let scalemul = diff / this.approachTime * this.approachScale + 1;
                    hit.approach.scale.set(0.5 * this.hitSpriteScale * scalemul);
                } else {
                    hit.approach.scale.set(0.5 * this.hitSpriteScale);
                }
                if (diff <= this.approachTime && diff > approachFullAppear) { // approach circle fading in
                    hit.approach.alpha = (this.approachTime - diff) / this.approachFadeInTime;
                }
                else if (diff <= approachFullAppear && hit.score < 0) { // approach circle opaque, just shrinking
                    hit.approach.alpha = 1;
                }
                // calculate opacity of circle
                let noteFullAppear = this.approachTime - hit.objectFadeInTime; // duration of opaque hit circle when approaching

                function setcircleAlpha(alpha) {
                    hit.base.alpha = alpha;
                    hit.circle.alpha = alpha;
                    for (let i = 0; i < hit.numbers.length; ++i)
                        hit.numbers[i].alpha = alpha;
                    hit.glow.alpha = alpha * self.glowMaxOpacity;
                }
                if (diff <= this.approachTime && diff > noteFullAppear) { // fading in
                    let alpha = (this.approachTime - diff) / hit.objectFadeInTime;
                    setcircleAlpha(alpha);
                }
                else if (diff <= noteFullAppear) {
                    if (-diff > hit.objectFadeOutOffset) { // fading out
                        let timeAfter = -diff - hit.objectFadeOutOffset;
                        setcircleAlpha(clamp01(1 - timeAfter / hit.circleFadeOutTime));
                        hit.approach.alpha = clamp01(1 - timeAfter / 50);
                    }
                    else {
                        setcircleAlpha(1);
                    }
                }
                // flash out if clicked
                if (hit.score > 0 && hit.enableflash) {
                    hit.burst.visible = true;
                    let timeAfter = time - hit.clickTime;
                    let t = timeAfter / this.glowFadeOutTime;
                    let newscale = 1 + 0.5 * t * (2 - t);
                    hit.burst.scale.set(newscale * hit.burst.initialscale);
                    hit.glow.scale.set(newscale * hit.glow.initialscale);
                    hit.burst.alpha = this.flashMaxOpacity * clamp01((timeAfter < this.flashFadeInTime) ? (timeAfter / this.flashFadeInTime) : (1 - (timeAfter - this.flashFadeInTime) / this.flashFadeOutTime));
                    hit.glow.alpha = clamp01(1 - timeAfter / this.glowFadeOutTime) * this.glowMaxOpacity;

                    if (hit.base.visible) {
                        if (timeAfter < this.flashFadeInTime) {
                            hit.base.scale.set(newscale * hit.base.initialscale);
                            hit.circle.scale.set(newscale * hit.circle.initialscale);
                            for (let i = 0; i < hit.numbers.length; ++i)
                                hit.numbers[i].scale.set(newscale * hit.numbers[i].initialscale);
                        }
                        else {
                            // hide circle
                            hit.base.visible = false;
                            hit.circle.visible = false;
                            for (let i = 0; i < hit.numbers.length; ++i)
                                hit.numbers[i].visible = false;
                            hit.approach.visible = false;
                        }
                    }
                }
                this.updateJudgement(hit.judgements[0], time);
            }

            this.updateSlider = function (hit, time) {
                // just make use of the duplicate part
                this.updateHitCircle(hit, time);

                let noteFullAppear = this.approachTime - hit.objectFadeInTime; // duration of opaque hit circle when approaching

                hit.body.startt = 0.0;
                hit.body.endt = 1.0;

                // set opacity of slider body
                function setbodyAlpha(alpha) {
                    hit.body.alpha = alpha;
                    for (let i = 0; i < hit.ticks.length; ++i)
                        hit.ticks[i].alpha = alpha;
                }
                let diff = hit.time - time; // milliseconds before hit.time
                if (diff <= this.approachTime && diff > noteFullAppear) {
                    // Fade in (before hit)
                    setbodyAlpha((this.approachTime - diff) / hit.objectFadeInTime);
                    if (hit.reverse) hit.reverse.alpha = hit.body.alpha;
                    if (hit.reverse_b) hit.reverse_b.alpha = hit.body.alpha;
                } else if (diff <= noteFullAppear) {
                    if (-diff > hit.fadeOutOffset) {
                        let t = clamp01((-diff - hit.fadeOutOffset) / hit.fadeOutDuration);
                        setbodyAlpha(1 - t * (2 - t));
                    }
                    else {
                        setbodyAlpha(1);
                        if (hit.reverse) hit.reverse.alpha = 1;
                        if (hit.reverse_b) hit.reverse_b.alpha = 1;
                    }
                }
                if (this.game.snakein) {
                    if (diff > 0) {
                        let t = clamp01((time - (hit.time - this.approachTime)) / (this.approachTime / 3));
                        hit.body.endt = t;
                        if (hit.reverse) {
                            let p = hit.curve.pointAt(t);
                            hit.reverse.x = p.x;
                            hit.reverse.y = p.y;
                            let p2;
                            if (t < 0.5) {
                                let p2 = hit.curve.pointAt(t + 0.005);
                                hit.reverse.rotation = Math.atan2(p.y - p2.y, p.x - p2.x);
                            } else {
                                let p2 = hit.curve.pointAt(t - 0.005);
                                hit.reverse.rotation = Math.atan2(p2.y - p.y, p2.x - p.x);
                            }
                        }
                    }
                }

                // set position of slider ball & follow circle
                // approach circle & hit circle moves along fading

                function resizeFollow(hit, time, dir) {
                    if (!hit.followLasttime) hit.followLasttime = time;
                    if (!hit.followLinearSize) hit.followLinearSize = 1;
                    let dt = time - hit.followLasttime;
                    hit.followLinearSize = Math.max(1, Math.min(2, hit.followLinearSize + dt * dir));
                    hit.followSize = hit.followLinearSize; // easing can happen here
                    hit.followLasttime = time;
                }

                if (-diff >= 0 && -diff <= hit.fadeOutDuration + hit.sliderTimeTotal) { // after hit.time & before slider disappears
                    // t: position relative to slider duration
                    let t = -diff / hit.sliderTime;
                    hit.currentRepeat = Math.min(Math.ceil(t), hit.repeat);
                    // check for slider edge hit
                    let atEnd = false;
                    if (Math.floor(t) > hit.lastrep) {
                        hit.lastrep = Math.floor(t);
                        if (hit.lastrep > 0 && hit.lastrep <= hit.repeat)
                            atEnd = true;
                    }
                    // clamp t
                    t = repeatclamp(Math.min(t, hit.repeat));

                    // Update ball and follow circle position
                    let at = hit.curve.pointAt(t);

                    hit.follow.x = at.x;
                    hit.follow.y = at.y;
                    hit.ball.x = at.x;
                    hit.ball.y = at.y;

                    if (hit.base.visible && hit.score <= 0) {
                        // the hit circle at start of slider will move if not hit
                        hit.base.x = at.x;
                        hit.base.y = at.y;
                        hit.circle.x = at.x;
                        hit.circle.y = at.y;
                        for (let i = 0; i < hit.numbers.length; ++i) {
                            hit.numbers[i].x = at.x;
                            hit.numbers[i].y = at.y;
                        }
                        hit.glow.x = at.x;
                        hit.glow.y = at.y;
                        hit.burst.x = at.x;
                        hit.burst.y = at.y;
                        hit.approach.x = at.x;
                        hit.approach.y = at.y;
                    }

                    let dx = game.mouseX - at.x;
                    let dy = game.mouseY - at.y;
                    let followPixelSize = hit.followSize * this.circleRadius;
                    let isfollowing = dx * dx + dy * dy <= followPixelSize * followPixelSize;
                    let predict = game.mouse(this.realtime);
                    let dx1 = predict.x - at.x;
                    let dy1 = predict.y - at.y;
                    isfollowing |= dx1 * dx1 + dy1 * dy1 <= (followPixelSize + predict.r) * (followPixelSize + predict.r);
                    let activated = this.game.down && isfollowing || hit.followSize > 1.01;


                    // slider tick judgement — score+combo only, accuracy unaffected
                    if (hit.nexttick < hit.ticks.length && time >= hit.ticks[hit.nexttick].time) {
                        if (activated) {
                            hit.ticks[hit.nexttick].result = true;
                            self.playTicksound(hit, hit.ticks[hit.nexttick].time);
                            // special rule: only missing slider end will not result in a miss
                            hit.judgements[hit.judgements.length - 1].defaultScore = 50;
                            hit.elementsHit++; // counts toward final slider %
                        }
                        self.scoreOverlay.hitTick(activated ? 10 : 0, time);
                        hit.nexttick++;
                    }

                    // slider edge judgement — score+combo only, accuracy unaffected
                    // (the slider's overall accuracy is committed once at the
                    // end via scoreOverlay.commitAccuracy()). Edges are worth
                    // 30 points per osu!stable.
                    // Note: being tolerant if follow circle hasn't shrinked to minimum
                    if (atEnd && activated) {
                        self.invokeJudgement(hit.judgements[hit.lastrep], 300, time);
                        self.scoreOverlay.hitTick(30, time);
                        hit.elementsHit++; // counts toward final slider %
                        self.playHitsound(hit, hit.lastrep, hit.time + hit.lastrep * hit.sliderTime);
                    }

                    // sliderball & follow circle Animation
                    if (-diff >= 0 && -diff <= hit.sliderTimeTotal) {
                        // slider ball immediately emerges
                        hit.ball.visible = true;
                        hit.ball.alpha = 1;
                        // follow circie immediately emerges and gradually enlarges
                        hit.follow.visible = true;
                        if (this.game.down && isfollowing)
                            resizeFollow(hit, time, 1 / this.followZoomInTime); // expand 
                        else
                            resizeFollow(hit, time, -1 / this.followZoomInTime); // shrink
                        let followscale = hit.followSize * 0.45 * this.hitSpriteScale;
                        hit.follow.scale.x = hit.follow.scale.y = followscale;
                        hit.follow.alpha = hit.followSize - 1;
                    }
                    let timeAfter = -diff - hit.sliderTimeTotal;
                    if (timeAfter > 0) {
                        resizeFollow(hit, time, -1 / this.followZoomInTime); // shrink
                        let followscale = hit.followSize * 0.45 * this.hitSpriteScale;
                        hit.follow.scale.x = hit.follow.scale.y = followscale;
                        hit.follow.alpha = hit.followSize - 1;
                        hit.ball.alpha = this.fadeOutEasing(timeAfter / this.ballFadeOutTime);
                        let ballscale = (1 + 0.15 * timeAfter / this.ballFadeOutTime) * 0.5 * this.hitSpriteScale;
                        hit.ball.scale.x = hit.ball.scale.y = ballscale;
                    }

                    // reverse arrow
                    if (hit.repeat > 1) {
                        let finalrepfromA = hit.repeat - hit.repeat % 2; // even
                        let finalrepfromB = hit.repeat - 1 + hit.repeat % 2; // odd
                        hit.reverse.visible = (hit.currentRepeat < finalrepfromA);
                        if (hit.reverse_b)
                            hit.reverse_b.visible = (hit.currentRepeat < finalrepfromB);
                        // TODO reverse arrow fade out animation
                    }

                    // update snaking out portion
                    if (this.game.snakeout) {
                        if (hit.currentRepeat == hit.repeat) {
                            if (hit.repeat % 2 == 1) {
                                hit.body.startt = t;
                                hit.body.endt = 1.0;
                            }
                            else {
                                hit.body.startt = 0.0;
                                hit.body.endt = t;
                            }
                        }
                    }
                }

                // calculate ticks fade in/out
                for (let i = 0; i < hit.ticks.length; ++i) {
                    if (time < hit.ticks[i].appeartime) { // fade in
                        let dt = hit.ticks[i].appeartime - time;
                        hit.ticks[i].alpha *= clamp01(1 - dt / 500);
                        hit.ticks[i].scale.set(0.5 * this.hitSpriteScale * (0.5 + 0.5 * clamp01((1 - dt / 500) * (1 + dt / 500))));
                    }
                    else {
                        hit.ticks[i].scale.set(0.5 * this.hitSpriteScale);
                    }
                    if (time >= hit.ticks[i].time) {
                        let dt = time - hit.ticks[i].time;
                        if (hit.ticks[i].result) { // hit
                            hit.ticks[i].alpha *= clamp01(-Math.pow(dt / 150 - 1, 5));
                            hit.ticks[i].scale.set(0.5 * this.hitSpriteScale * (1 + 0.5 * (dt / 150) * (2 - dt / 150)));
                        }
                        else { // missed
                            hit.ticks[i].alpha *= clamp01(1 - dt / 150);
                            hit.ticks[i].tint = colorLerp(0xffffff, 0xff0000, clamp01(dt / 75));
                        }
                    }
                }

                // ── osu!stable: final slider judgement (accuracy) ──
                // Once the slider has fully played out (head + body + all
                // edges), commit a single 300/100/50/Miss to accuracy based
                // on the % of components that were successfully hit.
                if (!hit.finalJudged && -diff >= hit.sliderTimeTotal) {
                    hit.finalJudged = true;
                    self.scoreOverlay.commitAccuracy(hit.elementsHit, hit.elementsTotal, time);
                }

                // display hit score
                for (let i = 0; i < hit.judgements.length; ++i)
                    this.updateJudgement(hit.judgements[i], time);
            }

            this.updateSpinner = function (hit, time) {
                // update rotation
                if (time >= hit.time && time <= hit.endTime) {
                    if (this.game.down) {
                        let Xr = this.game.mouseX - hit.x;
                        let Yr = this.game.mouseY - hit.y;
                        let mouseAngle = Math.atan2(Yr, Xr);
                        if (!hit.clicked) {
                            hit.clicked = true;
                        }
                        else {
                            let delta = mouseAngle - hit.lastAngle;
                            if (delta > Math.PI) delta -= Math.PI * 2;
                            if (delta < -Math.PI) delta += Math.PI * 2;
                            hit.rotation += delta;
                            hit.rotationProgress += Math.abs(delta);
                        }
                        hit.lastAngle = mouseAngle;
                    }
                    else {
                        hit.clicked = false;
                    }
                }

                // calculate opacity of spinner
                let alpha = 0;
                if (time >= hit.time - self.spinnerZoomInTime - self.spinnerAppearTime) {
                    if (time <= hit.endTime)
                        alpha = 1;
                    else
                        alpha = clamp01(1 - (time - hit.endTime) / self.spinnerFadeOutTime);
                }
                hit.top.alpha = alpha;
                hit.progress.alpha = alpha;
                hit.base.alpha = alpha;

                // calculate scales of components
                if (time < hit.endTime) {
                    // top zoom in first
                    hit.top.scale.set(0.3 * clamp01((time - (hit.time - self.spinnerZoomInTime - self.spinnerAppearTime)) / self.spinnerZoomInTime));
                    hit.base.scale.set(0.6 * clamp01((time - (hit.time - self.spinnerZoomInTime)) / self.spinnerZoomInTime));
                }
                if (time < hit.time) {
                    let t = (hit.time - time) / (self.spinnerZoomInTime + self.spinnerAppearTime);
                    if (t <= 1)
                        hit.top.rotation = -t * t * 10;
                }
                let progress = hit.rotationProgress / hit.rotationRequired;
                if (time > hit.time) {
                    hit.base.rotation = hit.rotation / 2;
                    hit.top.rotation = hit.rotation / 2;
                    hit.progress.scale.set(0.6 * (0.13 + 0.87 * clamp01(progress)));
                }
                else {
                    hit.progress.scale.set(0);
                }

                if (time >= hit.endTime) {
                    if (hit.score < 0) {
                        let points = 0;
                        if (progress >= 1) points = 300; else
                            if (progress >= 0.9) points = 100; else
                                if (progress >= 0.75) points = 50;
                        this.hitSuccess(hit, points, hit.endTime);
                    }
                }
                this.updateJudgement(hit.judgements[0], time);
            }

            this.updateHitObjects = function (time) {
                self.updateUpcoming(time);
                for (var i = self.upcomingHits.length - 1; i >= 0; i--) {
                    var hit = self.upcomingHits[i];
                    switch (hit.type) {
                        case "circle":
                            self.updateHitCircle(hit, time);
                            break;
                        case "slider":
                            self.updateSlider(hit, time);
                            break;
                        case "spinner":
                            self.updateSpinner(hit, time);
                            break;
                    }
                }
            }

            this.updateBackground = function (time) {
                if (!self.background) return;
                let fade = self.game.backgroundDimRate;
                if (time < -self.wait)
                    fade *= Math.max(0, 1 - (-self.wait - time) / self.backgroundFadeTime);
                self.background.tint = colorLerp(0xffffff, 0, fade);
            }

            this.render = function (timestamp) {
                this.realtime = new Date().getTime();
                if (window.lastPlaybackRenderTime) {
                    window.currentFrameInterval = this.realtime - window.lastPlaybackRenderTime;
                }
                window.lastPlaybackRenderTime = this.realtime;

                var time;
                if (this.audioReady) {
                    time = osu.audio.getPosition() * 1000 + self.offset;
                }
                if (typeof time !== 'undefined') {
                    let nextapproachtime = (waitinghitid < this.hits.length && this.hits[waitinghitid].time - (this.hits[waitinghitid].approachTime || this.approachTime) > time) ? this.hits[waitinghitid].time - (this.hits[waitinghitid].approachTime || this.approachTime) : -1;
                    this.breakOverlay.countdown(nextapproachtime, time);
                    this.updateBackground(time);
                    this.updateHitObjects(time);
                    this.scoreOverlay.update(time);
                    this.game.updatePlayerActions(time);
                    this.progressOverlay.update(time);
                    this.errorMeter.update(time);

                    // ── Flashlight follow cursor & combo-scaled radius ──
                    if (this.flashlightMask) {
                        this.flashlightMask.x = this.game.mouseX;
                        this.flashlightMask.y = this.game.mouseY;
                        const combo = this.scoreOverlay ? this.scoreOverlay.combo : 0;
                        let r = 200;
                        if (combo >= 200) r = 120;
                        else if (combo >= 100) r = 160;
                        this.flashlightMask.scale.set(r / 200);
                    }
                }
                else {
                    this.updateBackground(-100000);
                }
                this.volumeMenu.update(timestamp);
                this.loadingMenu.update(timestamp);
                // this.updateCursorPredictVisualizer();

                // ── Stamina (HP) death (PRIORITY: checked before end-of-song) ──
                // If the player's HP drops below 0 mid-play (no NF mod) we
                // freeze the gameplay and pop a "You Died" menu with the
                // option to retry or quit. Triggered exactly once.
                // SD/PF mods can also force HP to a negative value via score.js,
                // making this branch fire instantly on miss / non-300.
                if (
                    !this.ended
                    && !this.dead
                    && this.scoreOverlay
                    && typeof this.scoreOverlay.HP === 'number'
                    && this.scoreOverlay.HP < 0
                    && !(window.game && window.game.nofail)
                ) {
                    this.dead = true;
                    this.ended = true;
                    this.pause = function () { };
                    if (window.game) window.game.paused = true;
                    // Stop spawning / despawning hit objects so the children
                    // currently in `gamefield` are stable for the falling
                    // animation (otherwise they get .destroy()'d mid-fall).
                    self.updateHitObjects = function () { };

                    // ── Falling-circle physics ──────────────────────
                    // Snapshot every hit-object sprite currently visible
                    // in the gamefield and let them rain down with a
                    // gentle gravity + slight horizontal drift + spin.
                    // SliderMesh bodies don't respond to x/y the same
                    // way (they bake osu! coordinates into their geometry)
                    // so we hide them instead of pretending to fall.
                    try {
                        var SliderMeshCtor = (typeof SliderMesh !== 'undefined') ? SliderMesh : null;
                        self.fallingObjects = [];
                        for (var ci = 0; ci < self.gamefield.children.length; ci++) {
                            var child = self.gamefield.children[ci];
                            if (child === self.flashlightMask) continue;
                            // SliderMesh bakes coords into geometry → hide.
                            if (SliderMeshCtor && child instanceof SliderMeshCtor) {
                                child.alpha = 0;
                                continue;
                            }
                            // Real osu!stable falling: gentle, almost weightless
                            // drift. No big initial impulse, no sideways
                            // dash — just a slow gravity-driven slide.
                            child.__fallVx = (Math.random() - 0.5) * 0.3;
                            child.__fallVy = 0;
                            child.__fallVr = (Math.random() - 0.5) * 0.012;
                            self.fallingObjects.push(child);
                        }
                        var fallStep = function () {
                            // Bail out on retry/quit (clears self.dead).
                            if (!self.dead || !self.fallingObjects) return;
                            for (var i = 0; i < self.fallingObjects.length; i++) {
                                var o = self.fallingObjects[i];
                                if (!o || o._destroyed || o.destroyed) continue;
                                // Very gentle gravity (~0.05 osu px/frame²)
                                // capped at 1.4 osu px/frame so circles
                                // barely creep down — like osu!stable's fail
                                // animation. They never crash to the bottom
                                // because the death menu (≈2.5 s) covers the
                                // scene before they can travel that far.
                                o.__fallVy = Math.min(1.4, o.__fallVy + 0.05);
                                o.x += o.__fallVx;
                                o.y += o.__fallVy;
                                if (typeof o.rotation === 'number') o.rotation += o.__fallVr;
                            }
                            requestAnimationFrame(fallStep);
                        };
                        requestAnimationFrame(fallStep);
                    } catch (e) {
                        try { console.warn('[playback] fall animation failed', e); } catch (_) {}
                    }

                    // ── Death animation ─────────────────────────────
                    // 1) Audio decay: progressively crush the playback rate
                    //    to ~0.15 over 1.4 s so the song feels like it's
                    //    drowning. Volume ramps to 0 in 1.6 s. Pause hard
                    //    just before the death menu appears.
                    try {
                        var audio = self.osu && self.osu.audio;
                        if (audio && audio.audio && audio.source) {
                            var ctx = audio.audio;
                            var now = ctx.currentTime;
                            try {
                                audio.source.playbackRate.cancelScheduledValues(now);
                                audio.source.playbackRate.setValueAtTime(audio.source.playbackRate.value || 1.0, now);
                                // First drop quickly, then slow further.
                                audio.source.playbackRate.linearRampToValueAtTime(0.55, now + 0.45);
                                audio.source.playbackRate.linearRampToValueAtTime(0.15, now + 1.4);
                            } catch (_) {}
                            try {
                                if (audio.gain && audio.gain.gain) {
                                    audio.gain.gain.cancelScheduledValues(now);
                                    audio.gain.gain.setValueAtTime(audio.gain.gain.value, now);
                                    audio.gain.gain.linearRampToValueAtTime(0.0, now + 1.7);
                                }
                            } catch (_) {}
                            // Save the timer id so retry/quit and the
                            // early-skip path triggered by Esc can clear
                            // it. Otherwise this delayed pause would fire
                            // ~1.9 s later — after the user has already
                            // restarted the song with Retry — and silently
                            // stop the brand new playback.
                            self._deathPauseTimer = setTimeout(function () { try { audio.pause(); } catch (_) {} }, 1900);
                        } else {
                            try { self.osu.audio.pause(); } catch (_) {}
                        }
                    } catch (_) {}

                    // 2) DOM vignette + dying filter on the canvas + fade
                    //    to black curtain that completes before the menu.
                    try {
                        var gameArea = document.getElementById('game-area');
                        if (gameArea) gameArea.classList.add('is-dying');
                        var vignette = document.getElementById('death-vignette');
                        if (!vignette) {
                            vignette = document.createElement('div');
                            vignette.id = 'death-vignette';
                            document.body.appendChild(vignette);
                        }
                        vignette.classList.remove('show');
                        // Force reflow then add `.show` so the opacity
                        // transition actually runs from 0 → 1.
                        // eslint-disable-next-line no-unused-expressions
                        vignette.offsetWidth;
                        requestAnimationFrame(function () { vignette.classList.add('show'); });

                        // Black curtain — kicks in ~1.1 s after the
                        // vignette so players can see the circles rain
                        // down for a moment before the scene drowns in
                        // black. Combined with the 2200 ms transition,
                        // it reaches full opacity right around the time
                        // the death menu pops (≈2.5 s).
                        var fade = document.getElementById('death-fade');
                        if (!fade) {
                            fade = document.createElement('div');
                            fade.id = 'death-fade';
                            document.body.appendChild(fade);
                        }
                        fade.classList.remove('show');
                        // eslint-disable-next-line no-unused-expressions
                        fade.offsetWidth;
                        setTimeout(function () { fade.classList.add('show'); }, 1100);
                    } catch (_) {}

                    // 3) Smooth tint lerp on the PIXI background sprite.
                    try {
                        var startTint = (typeof self.background.tint === 'number') ? self.background.tint : 0xffffff;
                        var targetTint = 0x331111;
                        var tStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                        var lerpDuration = 1500;
                        var lerpStep = function () {
                            if (!self.dead) return;
                            var nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                            var k = Math.min(1, (nowMs - tStart) / lerpDuration);
                            var r1 = (startTint  >> 16) & 0xff, g1 = (startTint  >> 8) & 0xff, b1 = startTint  & 0xff;
                            var r2 = (targetTint >> 16) & 0xff, g2 = (targetTint >> 8) & 0xff, b2 = targetTint & 0xff;
                            var r = Math.round(r1 + (r2 - r1) * k);
                            var g = Math.round(g1 + (g2 - g1) * k);
                            var b = Math.round(b1 + (b2 - b1) * k);
                            self.background.tint = (r << 16) | (g << 8) | b;
                            if (k < 1) requestAnimationFrame(lerpStep);
                        };
                        requestAnimationFrame(lerpStep);
                    } catch (_) {
                        // Fallback: jump straight to the sombre tint.
                        self.background.tint = 0x553333;
                    }

                    // 4) Pop the death menu after the slow-mo settles
                    //    (after the black curtain has fully covered the
                    //    scene → ~2.5 s in). Stored on `that` so the Esc
                    //    handler can fire it early.
                    var that = this;
                    that.showDeathMenuNow = function () {
                        if (that.deathMenuShown) return;
                        that.deathMenuShown = true;
                        // Cancel the slow ~1.9 s delayed pause scheduled
                        // by the death sequence — we're about to pause
                        // the audio ourselves, and that pending timer
                        // would otherwise fire AFTER a Retry and silently
                        // kill the freshly restarted playback.
                        if (self._deathPauseTimer) {
                            clearTimeout(self._deathPauseTimer);
                            self._deathPauseTimer = null;
                        }
                        // Force the black curtain to opacity 1 instantly so
                        // we never expose a half-faded scene under the menu.
                        try {
                            var fadeNow = document.getElementById('death-fade');
                            if (fadeNow) {
                                fadeNow.style.transition = 'opacity 180ms ease';
                                fadeNow.classList.add('show');
                            }
                        } catch (_) {}
                        // Cut the audio IMMEDIATELY — no setTimeout, no
                        // ramp dependency. Even if the gain ramps weren't
                        // applied (some AudioContext quirks), this guarantees
                        // the BufferSourceNode is stopped right now.
                        try {
                            var a = self.osu && self.osu.audio;
                            if (a) {
                                // Pull the GainNode straight to 0 with no
                                // schedule so it's silent on the very next
                                // sample.
                                try {
                                    if (a.gain && a.gain.gain) {
                                        a.gain.gain.cancelScheduledValues(0);
                                        a.gain.gain.value = 0;
                                    }
                                } catch (_) {}
                                // Stop the BufferSourceNode hard.
                                try { a.pause(); } catch (_) {}
                                // And as a last resort, stop the raw source
                                // even if pause() returned false for any
                                // reason.
                                try { if (a.source) a.source.stop(0); } catch (_) {}
                            }
                        } catch (_) {}
                        try {
                            if (typeof that.scoreOverlay.showDeathMenu === 'function') {
                                that.scoreOverlay.showDeathMenu(
                                    that.track.metadata, that.errorMeter.record, that.retry, that.quit
                                );
                            } else {
                                that.scoreOverlay.visible = false;
                                that.scoreOverlay.showSummary(
                                    that.track.metadata, that.errorMeter.record, that.retry, that.quit
                                );
                            }
                        } catch (e) {
                            console.error('[playback] showDeathMenu failed', e);
                        }
                    };
                    that.deathMenuTimer = setTimeout(function () {
                        that.showDeathMenuNow();
                    }, 2500);
                }
                else if (time > this.endTime) {
                    // game ends
                    if (!this.ended) {
                        this.ended = true;
                        this.pause = function () { };
                        this.scoreOverlay.visible = false;
                        this.scoreOverlay.showSummary(this.track.metadata, this.errorMeter.record, this.retry, this.quit);
                    }
                    self.background.tint = 0xffffff;
                }
            }

            this.destroy = function () {
                // clean up
                console.log("playback:destroy");
                _.each(self.hits, function (hit) {
                    if (!hit.destroyed) {
                        _.each(hit.objects, function (o) { self.gamefield.removeChild(o); o.destroy(); });
                        _.each(hit.judgements, function (o) { self.gamefield.removeChild(o); o.destroy(); });
                        hit.destroyed = true;
                    }
                });
                let opt = { children: true, texture: false }
                self.scoreOverlay.destroy(opt);
                self.errorMeter.destroy(opt);
                self.loadingMenu.destroy(opt);
                self.volumeMenu.destroy(opt);
                self.breakOverlay.destroy(opt);
                self.progressOverlay.destroy(opt);
                self.gamefield.destroy(opt);
                self.background.destroy();
                // clean up event listeners
                window.onresize = null;
                window.removeEventListener("blur", blurCallback);
                window.removeEventListener('wheel', wheelCallback);
                window.removeEventListener('keydown', pauseKeyCallback);
                window.removeEventListener('keyup', resumeKeyCallback);
                self.game.cleanupPlayerActions();
                self.render = function () { };
            };

            this.start = function () {
                console.log("start playback")
                self.started = true;
                self.osu.audio.gain.gain.value = self.game.musicVolume * self.game.masterVolume;
                self.osu.audio.playbackRate = self.playbackRate;
                self.osu.audio.play(self.backgroundFadeTime + self.wait);
            };

            this.retry = function () {
                if (!self.game.paused) {
                    self.osu.audio.pause();
                    self.game.paused = true;
                }
                console.log("playback: retrying");
                // Clear any pending delayed-pause from the death sequence
                // — otherwise it would fire mid-retry and kill the new
                // playback's audio.
                if (self._deathPauseTimer) {
                    clearTimeout(self._deathPauseTimer);
                    self._deathPauseTimer = null;
                }
                // Clear the death overlay state so the next attempt starts
                // with a pristine canvas (no red vignette / black curtain
                // / dying filter / lingering CSS animation).
                try {
                    var ga = document.getElementById('game-area');
                    if (ga) ga.classList.remove('is-dying');
                    var v = document.getElementById('death-vignette');
                    if (v) v.classList.remove('show');
                    var f = document.getElementById('death-fade');
                    if (f) f.classList.remove('show');
                } catch (_) {}
                self.destroy();
                self.constructor(self.game, self.osu, self.track);
                self.loadingMenu.hide();
                self.audioReady = true;
                self.start();
            }

            this.quit = function () {
                if (!self.game.paused) {
                    self.osu.audio.pause();
                    self.game.paused = true;
                }
                console.log("playback: quiting");
                if (self._deathPauseTimer) {
                    clearTimeout(self._deathPauseTimer);
                    self._deathPauseTimer = null;
                }
                // Clear the death overlay state on quit too — the death
                // menu has its own fade-out and we don't want a residual
                // red vignette / black curtain on the song-select page.
                try {
                    var ga = document.getElementById('game-area');
                    if (ga) ga.classList.remove('is-dying');
                    var v = document.getElementById('death-vignette');
                    if (v) v.classList.remove('show');
                    var f = document.getElementById('death-fade');
                    if (f) f.classList.remove('show');
                } catch (_) {}
                self.destroy();
                if (window.quitGame)
                    window.quitGame();
            }
        }

        return Playback;
    });
