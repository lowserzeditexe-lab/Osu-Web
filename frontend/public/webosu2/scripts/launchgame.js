function launchOSU(osu, beatmapid, version) {
  // select track
  let trackid = -1;
  // mode can be 0 or undefined
  for (let i = 0; i < osu.tracks.length; ++i)
    if (
      osu.tracks[i].metadata.BeatmapID == beatmapid ||
      (!osu.tracks[i].mode && osu.tracks[i].metadata.Version == version)
    )
      trackid = i;
  console.log("launching", beatmapid, version);
  if (trackid == -1) {
    console.error("no such track");
    console.log("available tracks are:");
    for (let i = 0; i < osu.tracks.length; ++i)
      console.log(
        osu.tracks[i].metadata.BeatmapID,
        osu.tracks[i].mode,
        osu.tracks[i].metadata.Version
      );
    return;
  }
  // prevent launching multiple times
  if (window.app) return;
  console.log("launching PIXI app");
  // launch PIXI app
  let viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  let app = (window.app = new PIXI.Application({
    width: window.innerWidth,
    height: viewportHeight,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  }));
  app.renderer.autoResize = true;
  app.renderer.background.color = 0x111111;

  // Add a resize listener to update the canvas dimensions dynamically
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      if (app && app.renderer) {
        let vpHeight = window.visualViewport.height || window.innerHeight;
        app.renderer.resize(window.innerWidth, vpHeight);
      }
    });
  } else {
    window.addEventListener("resize", () => {
      if (app && app.renderer) {
        app.renderer.resize(window.innerWidth, window.innerHeight);
      }
    });
  }

  // remember where the page is scrolled to
  let scrollTop = document.body.scrollTop;
  // get ready for gaming
  document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    return false;
  });
  document.body.classList.add("gaming");
  // update game settings
  if (window.gamesettings) {
    window.gamesettings.refresh();
    window.gamesettings.loadToGame();
  }

  // load cursor
  if (!game.showhwmouse || game.autoplay) {
    game.cursor = new PIXI.Sprite(Skin["cursor.png"]);
    game.cursor.anchor.x = game.cursor.anchor.y = 0.5;
    // 0.32 ≈ original 0.3 (slightly bigger so the bullseye is visible
    // without dominating the playfield).
    game.cursor.scale.x = game.cursor.scale.y = 0.32 * game.cursorSize;
    // Subtle additive halo so the cursor stays readable on bright/cluttered
    // backgrounds (and during the dying filter). Kept small + low alpha to
    // not feel "huge".
    var glow = new PIXI.Sprite(Skin["cursor.png"]);
    glow.anchor.x = glow.anchor.y = 0.5;
    glow.scale.x = glow.scale.y = 0.5 * game.cursorSize;
    glow.tint = 0xffffff;
    glow.alpha = 0.22;
    glow.blendMode = PIXI.BLEND_MODES.ADD;
    game.cursorGlow = glow;
    game.stage.addChild(glow);
    game.stage.addChild(game.cursor);
  }

  // switch page to game view
  if (game.autofullscreen) document.documentElement.requestFullscreen();
  let pGameArea = document.getElementById("game-area");
  var pMainPage = document.getElementById("main-page");
  var pNav = document.getElementById("main-nav");
  pGameArea.appendChild(app.view);
  if (game.autoplay || game.autopilot) {
    pGameArea.classList.remove("shownomouse");
    pGameArea.classList.remove("showhwmousemedium");
    pGameArea.classList.remove("showhwmousesmall");
    pGameArea.classList.remove("showhwmousetiny");
  } else if (game.showhwmouse) {
    pGameArea.classList.remove("shownomouse");
    if (game.cursorSize < 0.65) pGameArea.classList.add("showhwmousetiny");
    else if (game.cursorSize < 0.95)
      pGameArea.classList.add("showhwmousesmall");
    else pGameArea.classList.add("showhwmousemedium");
  } else {
    pGameArea.classList.add("shownomouse");
    pGameArea.classList.remove("showhwmousemedium");
    pGameArea.classList.remove("showhwmousesmall");
    pGameArea.classList.remove("showhwmousetiny");
  }
  pMainPage.setAttribute("hidden", "");
  pNav.setAttribute("style", "display: none");
  pGameArea.removeAttribute("hidden");

  var gameLoop;
  // set quit callback
  window.quitGame = function () {
    // this shouldn't be called before playback is cleaned up
    // restore webpage state
    pGameArea.setAttribute("hidden", "");
    pMainPage.removeAttribute("hidden");
    pNav.removeAttribute("style");
    document.body.classList.remove("gaming");
    // restore page scroll position
    document.body.scrollTop = scrollTop;
    // TODO application level clean up
    if (game.cursor) {
      game.stage.removeChild(game.cursor);
      game.cursor.destroy();
      game.cursor = null;
    }
    if (game.cursorGlow) {
      game.stage.removeChild(game.cursorGlow);
      game.cursorGlow.destroy();
      game.cursorGlow = null;
    }
    window.app.destroy(true, { children: true, texture: false });
    window.app = null;
    gameLoop = null;
    window.cancelAnimationFrame(window.animationRequestID);
  };

  // load playback
  var playback = new Playback(window.game, osu, osu.tracks[trackid]);
  game.scene = playback;
  playback.onload = function () {
    // stop beatmap preview
    let audios = document.getElementsByTagName("audio");
    for (let i = 0; i < audios.length; ++i) audios[i].softstop();
  };
  playback.load(); // load audio

  // start main loop
  gameLoop = function (timestamp) {
    if (game.scene) {
      game.scene.render(timestamp);
    }
    if (game.cursor) {
      // Handle cursor
      game.cursor.x = (game.mouseX / 512) * gfx.width + gfx.xoffset;
      game.cursor.y = (game.mouseY / 384) * gfx.height + gfx.yoffset;
      if (game.cursorGlow) {
        game.cursorGlow.x = game.cursor.x;
        game.cursorGlow.y = game.cursor.y;
        // Subtle pulse so the cursor feels alive without being noisy.
        var t = (timestamp || 0) * 0.004;
        game.cursorGlow.alpha = 0.18 + 0.08 * (0.5 + 0.5 * Math.sin(t));
        game.cursorGlow.bringToFront();
      }
      game.cursor.bringToFront();
    }
    app.renderer.render(game.stage);
    window.animationRequestID = window.requestAnimationFrame(gameLoop);
  };
  window.animationRequestID = window.requestAnimationFrame(gameLoop);
}

function launchGame(osublob, beatmapid, version) {
  // unzip osz & parse beatmap
  let fs = new zip.fs.FS();
  fs.root.importBlob(
    osublob,
    function () {
      let osu = new Osu(fs.root);
      osu.ondecoded = function () {
        launchOSU(osu, beatmapid, version);
      };
      osu.onerror = function () {
        console.error("osu parse error");
      };
      osu.load();
    },
    function (err) {
      console.error("unzip failed");
    }
  );
}
