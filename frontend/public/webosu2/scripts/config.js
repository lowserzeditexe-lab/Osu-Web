// scripts/config.js — WebOsu 2 integration for osu!web (CORS-friendly mirror)
const BEATMAP_PROVIDER = {
    // .osz download — NeriNyan (CORS-friendly)
    DOWNLOAD: "https://api.nerinyan.moe/d/",
    // Audio preview (mp3) — official osu
    PREVIEW: "https://b.ppy.sh/preview/",
    // Cover image — official osu (jpg)
    COVER: "https://assets.ppy.sh/beatmaps/",
    // Beatmap info / list — Sayobot (used by default WebOsu 2 lists; we don't need it for /play)
    API_INFO: "https://api.sayobot.cn/beatmapinfo?1=",
    API_INFO_V2: "https://api.sayobot.cn/v2/beatmapinfo?0=",
    API_LIST: "https://api.sayobot.cn/beatmaplist",
};

function getDownloadUrl(sid) {
    // noVideo=1 keeps the .osz small so loading is fast
    return `${BEATMAP_PROVIDER.DOWNLOAD}${sid}?noVideo=1`;
}
function getPreviewUrl(sid) { return `${BEATMAP_PROVIDER.PREVIEW}${sid}.mp3`; }
function getCoverUrl(sid)   { return `${BEATMAP_PROVIDER.COVER}${sid}/covers/cover.jpg`; }
function getInfoUrl(sid)    { return `${BEATMAP_PROVIDER.API_INFO}${sid}`; }
function getInfoUrlV2(sid)  { return `${BEATMAP_PROVIDER.API_INFO_V2}${sid}`; }
