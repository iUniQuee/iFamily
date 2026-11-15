// Хуудасны загвар: темүүд (4 өнгө), картын дизайн (3), layout, клиентийн туслах

const CSS = `
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0; font-family: system-ui, "Segoe UI", Roboto, sans-serif;
  background: var(--bg); color: var(--text); overflow: hidden;
  -webkit-tap-highlight-color: transparent;
}
:root {
  --bg: #fff8ee; --bg2: #fbe8d2; --bg3: #f3e6f1; --panel: #ffffff; --accent: #3b82c4;
  --accent2: #2a6398; --text: #2b2118; --muted: #7b6957; --line: #eeddcb;
  --card: #ffffff; --shadow: 0 4px 14px rgba(80,50,20,.13); --danger: #d9534f;
}
html[data-theme="green"] {
  --bg: #fdf9e9; --bg2: #eef3da; --bg3: #e2eddb; --accent: #2f9e5f; --accent2: #237a48;
  --text: #1d2a20; --muted: #6d7a63; --line: #e3e6cf; --card: #ffffff;
  --shadow: 0 4px 14px rgba(60,60,25,.13);
}
html[data-theme="brown"] {
  --bg: #fdf3e3; --bg2: #f6e2c8; --bg3: #efd8bd; --accent: #a06a3f; --accent2: #7c5028;
  --text: #2a2118; --muted: #7d6a56; --line: #eddcc4; --card: #fffdf9;
  --shadow: 0 4px 14px rgba(80,55,25,.14);
}
html[data-theme="dark"] {
  --bg: #181410; --bg2: #221b15; --bg3: #171c24; --panel: #1d232c; --accent: #5aa9e6;
  --accent2: #7cbdf0; --text: #e9e3da; --muted: #a1958a; --line: #3a322a;
  --card: #222a35; --shadow: 0 4px 14px rgba(0,0,0,.45);
}
html[data-theme="sand"] {
  --bg: #f7f1e4; --bg2: #efe3cf; --bg3: #e7d9c1; --panel: #fffdf8; --accent: #c08a4a;
  --accent2: #9a6a31; --text: #2f281e; --muted: #7c6c58; --line: #e6d8c2; --card: #fffdf8;
  --shadow: 0 4px 14px rgba(90,65,30,.15);
}
html[data-theme="rose"] {
  --bg: #fff1f5; --bg2: #ffe0e9; --bg3: #f6dbe8; --panel: #fffafc; --accent: #d0578a;
  --accent2: #a8386a; --text: #331f28; --muted: #83616f; --line: #f2d3de; --card: #ffffff;
  --shadow: 0 4px 14px rgba(120,50,80,.13);
}
html[data-theme="lilac"] {
  --bg: #f6f2ff; --bg2: #ebe3ff; --bg3: #e2d9f5; --panel: #fdfbff; --accent: #7b5cd6;
  --accent2: #5d3fb3; --text: #241d38; --muted: #6f6588; --line: #e2daf3; --card: #ffffff;
  --shadow: 0 4px 14px rgba(70,50,120,.14);
}
html[data-theme="teal"] {
  --bg: #ecfafb; --bg2: #d9f1f3; --bg3: #cfedef; --panel: #f9fefe; --accent: #159a9c;
  --accent2: #0d7377; --text: #17302f; --muted: #5d7b7a; --line: #cfe9e9; --card: #ffffff;
  --shadow: 0 4px 14px rgba(10,80,80,.13);
}
html[data-theme="sunset"] {
  --bg: #fff5ea; --bg2: #ffdcc7; --bg3: #ffd0b0; --panel: #fffbf6; --accent: #e2703a;
  --accent2: #b9542a; --text: #34211a; --muted: #8a6a5a; --line: #f6d9c6; --card: #ffffff;
  --shadow: 0 4px 14px rgba(120,70,35,.15);
}
html[data-theme="midnight"] {
  --bg: #0f1724; --bg2: #16233a; --bg3: #1b2b45; --panel: #172233; --accent: #6aa9ff;
  --accent2: #8cc2ff; --text: #e6edf7; --muted: #93a4bd; --line: #26354d; --card: #1c2a3f;
  --shadow: 0 4px 14px rgba(0,0,0,.5);
}
#top {
  position: fixed; inset: 0 0 auto 0; height: 52px; display: flex; align-items: center;
  gap: 10px; padding: 0 12px; background: var(--panel); border-bottom: 1px solid var(--line);
  z-index: 60; box-shadow: var(--shadow);
}
.brand { font-weight: 800; font-size: 16px; white-space: nowrap; }
/* Мэню: утсан дээр доошоо/дээшээ гуйхгүй — ХОЙШОО (хэвтээ) гүйлгэнэ */
#topbtns {
  display: flex; gap: 6px; flex-wrap: nowrap; flex: 1; min-width: 0;
  overflow-x: auto; overflow-y: hidden; white-space: nowrap;
  -webkit-overflow-scrolling: touch; scrollbar-width: none; padding-bottom: 1px;
}
#topbtns::-webkit-scrollbar { display: none; height: 0; }
#topbtns > * { flex: 0 0 auto; }
#who { color: var(--muted); font-size: 13px; white-space: nowrap; }
button, .btn {
  border: 1px solid var(--line); background: var(--panel); color: var(--text);
  border-radius: 8px; padding: 6px 10px; font-size: 13px; cursor: pointer;
  font-family: inherit; white-space: nowrap; text-decoration: none;
}
button:hover, .btn:hover { border-color: var(--accent); color: var(--accent); }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button.primary:hover { background: var(--accent2); color: #fff; }
button.danger { background: var(--danger); border-color: var(--danger); color: #fff; }
/* Устгах товч — тухайн хүний хүйсийн өнгөөр (эрэгтэй цэнхэр, эмэгтэй ягаан, тодорхойгүй саарал) */
button.danger.sex-m { background: #4a90d9; border-color: #3a7bc0; }
button.danger.sex-f { background: #d06a9a; border-color: #b8517f; }
button.danger.sex-q { background: #9aa7b5; border-color: #8593a2; }
button.danger.sex-m:hover, button.danger.sex-f:hover, button.danger.sex-q:hover { filter: brightness(.92); }
button.ghost { background: transparent; }
html { touch-action: pan-x pan-y; }
html, body { overscroll-behavior: none; }
body { -webkit-text-size-adjust: 100%; }
#viewport {
  position: fixed; inset: 52px 0 0 0; overflow: hidden; cursor: grab;
  /* ЗУМЫГ ЗӨВХӨН апп өөрөө зохицуулна — браузер хуудсыг томруулж, дээд
     мэнюг хөдөлгөх/алга болгохыг хориглоно. */
  touch-action: none; -webkit-user-select: none; user-select: none;
  background: linear-gradient(160deg, var(--bg) 0%, var(--bg2) 52%, var(--bg3) 100%);
}
#viewport.dragging { cursor: grabbing; }

#world { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; backface-visibility: hidden; }
#links { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; }
.link-c { fill: none; stroke: var(--link1, #4a90d9); stroke-width: 2.5; }
.link-s { fill: none; stroke: var(--link2, #e0a458); stroke-width: 2.5; }
.link-plat { fill: rgba(224,164,88,.07); stroke: rgba(224,164,88,.45); stroke-width: 1.5; stroke-dasharray: 7 6; }
.link-t { fill: none; stroke: var(--link3, #b48bd4); stroke-width: 1.5; stroke-dasharray: 5 4; }
/* Нуугдсан хамаатаны бүлгийн тэмдэг (карт энгэр дээр) */
.card .grp {
  position: absolute; left: -8px; top: -11px; z-index: 6;
  background: #f97316; color: #fff; border: 2px solid #fff;
  border-radius: 12px; padding: 1px 8px; font-size: 11px; font-weight: 700;
  cursor: pointer; box-shadow: var(--shadow); line-height: 1.4; white-space: nowrap;
}
.card .grp:hover { background: #ea580c; }
html[data-card="big"] .card .grp { top: -8px; }
#cards { position: absolute; left: 0; top: 0; }
/* картын шилжилт */ .card { transition: left 150ms ease-out, top 150ms ease-out; }
  .card { position: absolute; width: 156px; user-select: none; }
.card .box {
  height: 96px; background: #fff; border: 2px solid #e6ebf3;
  box-shadow: 0 4px 14px rgba(23,42,74,.10); display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 2px;
  padding: 4px 2px 3px; cursor: pointer; overflow: hidden;
  width: 140px; margin: 0 auto;
}
html[data-card="round"] .card .box { border-radius: 22px; }
html[data-card="square"] .card .box { border-radius: 6px; }
html[data-card="big"] .card .box { border-radius: 24px; }
html[data-card="big"] .card .ava { width: 46px; height: 46px; font-size: 18px; }

/* «Шилдэг» — дугуй, гялалзсан, хүйсийн өнгийн туузтай карт (бүх хэлбэрийн шилдэг шинж) */
html[data-card="best"] .card .box {
  border-radius: 18px; border: 2px solid #dfe8f5;
  background: linear-gradient(180deg, #ffffff 0%, #f6f9ff 55%, #e9f1fd 100%);
  box-shadow: 0 6px 16px rgba(23,42,74,.14);
  padding: 3px 2px 2px;
}
html[data-card="best"] .card.m .box { border-top: 4px solid #4a90d9; }
html[data-card="best"] .card.f .box { border-top: 4px solid #d06a9a; }
html[data-card="best"] .card.q .box { border-top: 4px solid #9aa7b5; }
/* Нас барсан хүний картын дээд тууз — хүйсийн өнгө биш, СААРАЛ (нас барсны тэмдэг) */
html[data-card="best"] .card.dead .box { border-top-color: #8d99a6; }
html[data-card="best"] .card.dead .ava { filter: grayscale(.35); }
html[data-card="best"] .card .ava {
  border: 2px solid #fff; box-shadow: 0 2px 6px rgba(23,42,74,.18);
}
html[data-card="best"] .card img.ava { background: #eef3fb; }
html[data-card="best"] .card .nm { font-size: 14.5px; }
html[data-card="best"] .card .meta { font-size: 11px; color: #5b6f89; }
html[data-card="best"] .card.sel .box { outline: 1px solid #f59e0b; outline-offset: -1px; box-shadow: 0 4px 14px rgba(23,42,74,.10); }
html[data-card="best"] .card.focus .box { outline: 1px solid #2fae6a; outline-offset: -1px; box-shadow: 0 4px 14px rgba(23,42,74,.10); }
.card .ava {
  width: 44px; height: 44px; min-width: 44px; border-radius: 50%;
  background: #9aa7b5; color: #fff; display: flex; align-items: center;
  justify-content: center; font-weight: 700; font-size: 17px;
}
.card.f .ava { background: #d06a9a; }
.card.m .ava { background: #4a90d9; }
/* Нүүр зураг — дугуй дотор бүтэн дүүрэн харагдана */
.card img.ava { object-fit: cover; background: #e6ebf3; border: 0; display: block; }
.card .nm {
  font-size: 14.5px; font-weight: 800; line-height: 1.08; text-align: center; width: 100%;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.card .dead .ava { filter: grayscale(1); opacity: .7; }
.card .meta { font-size: 11px; color: #6d7f96; text-align: center; margin-top: 0; letter-spacing: .2px; line-height: 1.05; }
.card.sel .box { outline: 1px solid #f59e0b; outline-offset: -1px; box-shadow: 0 4px 14px rgba(23,42,74,.10); }
.card.focus .box { outline: 1px solid #2fae6a; outline-offset: -1px; box-shadow: 0 4px 14px rgba(23,42,74,.10); }
.card.dead .box { opacity: .8; }
/* Нас барсан гишүүний жижиг тэмдэг — картын баруун дээд буланд */
.card .dead-mark {
  position: absolute; top: -6px; right: -6px; z-index: 7;
  min-width: 18px; height: 18px; box-sizing: border-box;
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0 4px; background: #8d99a6; color: #fff;
  border: 2px solid #fff; border-radius: 9px;
  font-size: 12px; font-weight: 800; line-height: 1;
  box-shadow: 0 1px 4px rgba(0,0,0,.25); pointer-events: none;
}
.acts button {
  position: absolute; width: 26px; height: 26px; padding: 0; border-radius: 50%;
  font-size: 14px; line-height: 1; box-shadow: var(--shadow); z-index: 5;
  display: flex; align-items: center; justify-content: center;
}
.acts .a-info {
  left: -13px; top: 34px; width: 28px; height: 28px;
  background: #22c55e; color: #fff; border-color: #16a34a; font-weight: 700;
}
.acts .a-add {
  left: 50%; transform: translateX(-50%); top: -14px; width: 30px; height: 30px;
  background: #f59e0b; color: #fff; border-color: #d97706; font-size: 18px; font-weight: 700;
}
.acts .a-edit {
  right: -13px; left: auto; top: 34px; width: 28px; height: 28px;
  background: #0ea5b7; color: #fff; border-color: #0b8b99;
}
#panel {
  position: fixed; top: 52px; right: 0; bottom: 0; width: 330px; max-width: 92vw;
  background: var(--panel); border-left: 1px solid var(--line); z-index: 40;
  overflow-y: auto; padding: 14px; box-shadow: var(--shadow);
}
#panel h2 { margin: 0 0 4px; font-size: 17px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
#panel h2 .pat { font-size: 12.5px; font-weight: 600; color: var(--muted); }
#panel .close { margin-left: auto; }
.kv { margin: 4px 0; font-size: 13px; }
.kv b { color: var(--muted); font-weight: 600; }
.rel-h { margin: 12px 0 4px; font-size: 12px; color: var(--muted); font-weight: 700; text-transform: uppercase; }
.rel-p { display: flex; flex-wrap: wrap; gap: 5px; }
.rel-p span {
  font-size: 12px; border: 1px solid var(--line); border-radius: 12px;
  padding: 3px 9px; cursor: pointer; background: var(--bg);
}
.rel-p span:hover { border-color: var(--accent); color: var(--accent); }
.locked { font-size: 12px; color: var(--muted); background: var(--bg); border: 1px dashed var(--line); padding: 8px; border-radius: 8px; margin: 6px 0; }
.pbtns { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
.hidden { display: none !important; }
.center {
  position: fixed; inset: 52px 0 0 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 14px; text-align: center; padding: 20px;
}
.center h1 { font-size: 22px; margin: 0; color: var(--accent); }
.center p { color: var(--muted); max-width: 420px; }
#modalroot {
  position: fixed; inset: 0; background: rgba(10,15,25,.5); z-index: 100;
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.modal {
  background: var(--panel); border-radius: 14px; width: 460px; max-width: 96vw;
  max-height: 88vh; display: flex; flex-direction: column; box-shadow: var(--shadow);
}
.modal .mh { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--line); font-weight: 700; }
.modal .mb { padding: 14px 16px; overflow-y: auto; }
.modal .mf { padding: 12px 16px; border-top: 1px solid var(--line); display: flex; gap: 8px; justify-content: flex-end; }
/* Эрх ба карт холболт — өргөн, уншигдахуйц харагдац */
.modal.users-modal { width: min(900px, 96vw); }
.modal.users-modal .mb { padding: 16px 18px; }
.users-modal .list-row {
  display: grid; grid-template-columns: minmax(160px, 1.15fr) auto minmax(140px, .8fr) minmax(230px, 1.45fr);
  gap: 10px; align-items: center; padding: 10px 4px;
}
.users-modal .list-row .uhead { display: flex; align-items: center; gap: 6px; min-width: 0; }
.users-modal .list-row .uhead .grow { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.users-modal .list-row select { width: 100%; min-width: 0; }
.users-modal .list-row button { white-space: nowrap; }

label.f { display: block; font-size: 12px; color: var(--muted); margin: 8px 0 3px; font-weight: 600; }
input[type=text], input[type=tel], input[type=date], input[type=password], select, textarea {
  width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--bg); color: var(--text); font-family: inherit; font-size: 13px;
}
textarea { min-height: 80px; resize: vertical; }
.row { display: flex; gap: 8px; }
.row > * { flex: 1; }
.radio, .check { font-size: 13px; display: flex; align-items: center; gap: 6px; margin: 4px 0; }
.picker { border: 1px solid var(--line); border-radius: 8px; max-height: 190px; overflow-y: auto; margin-top: 6px; }
.picker div { padding: 7px 10px; font-size: 13px; cursor: pointer; display: flex; gap: 6px; align-items: center; }
.picker div:hover { background: var(--bg); }
.picker div.on { background: var(--accent); color: #fff; }
.badge { font-size: 10px; border: 1px solid currentColor; border-radius: 8px; padding: 0 5px; opacity: .8; }
#menu {
  position: fixed; z-index: 90; background: var(--panel); border: 1px solid var(--line);
  border-radius: 12px; box-shadow: var(--shadow); padding: 6px; min-width: 220px;
}
#menu button { display: block; width: 100%; text-align: left; border: 0; background: none; padding: 9px 12px; border-radius: 8px; font-size: 13.5px; }
#menu button:hover { background: var(--bg); color: var(--text); }
#toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: var(--text); color: var(--bg); padding: 10px 18px; border-radius: 10px;
  z-index: 200; font-size: 13.5px; box-shadow: var(--shadow); max-width: 90vw;
}
.list-row { display: flex; align-items: center; gap: 8px; padding: 7px 4px; border-bottom: 1px solid var(--line); font-size: 13px; }
.list-row .grow { flex: 1; cursor: pointer; }
.list-row select { width: auto; }
/* Нэр + устгах товч НЭГ мөрөнд (утасны дэлгэцэд ч) */
.list-row .uhead { display: contents; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.thumb { width: 100%; border-radius: 8px; }
.pager { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
.copy { font-size: 11px; color: var(--muted); word-break: break-all; }
/* «Садан нэмэх» сонголт */
.rel-sec { display: flex; align-items: center; gap: 8px; margin: 14px 0 6px; font-size: 12.5px; font-weight: 800; color: var(--text); }
.rel-sec:first-child { margin-top: 0; }
.rel-ico { width: 22px; height: 22px; border-radius: 6px; background: var(--accent); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; flex: 0 0 auto; }
.rel-opt { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: var(--bg); border: 2px solid transparent; cursor: pointer; margin: 6px 0; }
.rel-opt:hover { border-color: var(--accent); }
.rel-opt.on { border-color: var(--accent); background: var(--bg2); }
.rel-opt .emo { font-size: 22px; width: 30px; text-align: center; flex: 0 0 auto; }
.rel-opt b { display: block; font-size: 13.5px; }
.rel-opt small { color: var(--muted); font-size: 11.5px; }
/* Анхдагч дүрс — админ сүлжээ */
.av-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.av-cell { border: 1px solid var(--line); border-radius: 12px; padding: 10px; text-align: center; background: var(--bg); }
.av-cell b { display: block; font-size: 12.5px; margin-top: 6px; }
.av-cell small { display: block; color: var(--muted); font-size: 11px; margin-bottom: 8px; }
.av-prev { width: 84px; height: 84px; margin: 0 auto; border-radius: 50%; overflow: hidden; background: var(--bg2); display: flex; align-items: center; justify-content: center; font-size: 30px; color: var(--muted); border: 1px solid var(--line); }
.av-prev img { width: 100%; height: 100%; object-fit: cover; display: block; }
.av-btns { display: flex; gap: 6px; justify-content: center; }
.av-btns button { padding: 5px 8px; font-size: 12px; }
button.btn-amber { background: #e8912d; border-color: #e8912d; color: #fff; }
button.btn-amber:hover { background: #cf7d1f; border-color: #cf7d1f; color: #fff; }
button.btn-ok { background: var(--accent); border-color: var(--accent); color: #fff; }
button.btn-ok:hover { filter: brightness(.9); }
.mf button[disabled] { opacity: .45; cursor: not-allowed; }
/* гишүүн бүрэн форм */
.emo-chips { display: flex; gap: 6px; }
.emo-chips span { flex: 1; text-align: center; padding: 8px 0; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); cursor: pointer; font-size: 20px; }
.emo-chips span:hover { border-color: var(--accent); }
.emo-chips span.on { border-color: var(--accent); background: var(--bg2); }
.photo-prev { margin-top: 8px; }
.photo-prev img { max-height: 120px; border-radius: 8px; border: 1px solid var(--line); }
/* хамаарлын ногоон нэрс + тодруулга */
.rpill {
  display: block; width: max-content; max-width: 100%; margin: 1px auto 0;
  background: #2fae6a; color: #fff; font-size: 10.5px; font-weight: 700;
  padding: 2px 9px; border-radius: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.card { transition: opacity .15s; }
.card.kin .box { outline: 1px solid #2fae6a; outline-offset: -1px; }
.link-s.link-hl, .link-c.link-hl { stroke: #2fae6a; stroke-width: 4; }
/* Тодруулга: АЛТ = шууд дээшээ үе, ЦЭНХЭР = шууд доошоо үе (хажуугийнх ялгарахгүй) */
.card.asc .box { outline: 1px solid #f5c542; outline-offset: -1px; }
.card.desc .box { outline: 1px solid #2fae6a; outline-offset: -1px; }
.link-s.link-up, .link-c.link-up { stroke: #FFD700; stroke-width: 4; }
.link-s.link-down, .link-c.link-down { stroke: #2f80ed; stroke-width: 4; }
/* Хамаарлын шугамын өнгө: хүүхэд — ногоон, ах/дүү — бүдэг цэнхэр,
   эцгийн ах/дүү — бүдэг усан үзэм ягаан, эхийн ах/дүү — бор */
.link-s.link-kid, .link-c.link-kid { stroke: #2fae6a; stroke-width: 4; }
.link-s.link-sib, .link-c.link-sib { stroke: #9ec5f2; stroke-width: 4; }
.link-s.link-pat, .link-c.link-pat { stroke: #d9a8c8; stroke-width: 4; }
.link-s.link-mat, .link-c.link-mat { stroke: #8b5e3c; stroke-width: 4; }

/* ---------- Апп нээгдэх үеийн splash (PWA лого) ---------- */
#splash {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px;
  background: radial-gradient(120% 90% at 50% 16%, #3a2708 0%, #1b1206 55%, #0b0703 100%);
  color: #f4d99a;
  transition: opacity .35s ease;
}
#splash img {
  width: 148px; height: 148px; border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(255,220,140,.35), 0 18px 50px rgba(0,0,0,.55), 0 0 44px rgba(240,200,110,.32);
}
#splash .spt { font-size: 24px; font-weight: 800; letter-spacing: .6px; color: #f7e3b0; }
#splash .spsub { font-size: 12.5px; letter-spacing: 2.2px; text-transform: uppercase; color: #c9a76a; margin-top: -8px; }
#splash .sps {
  width: 26px; height: 26px; border: 3px solid rgba(247,227,176,.22);
  border-top-color: #f7e3b0; border-radius: 50%; animation: spspin .8s linear infinite;
}
@keyframes spspin { to { transform: rotate(360deg); } }
/* ---------- Утасны дэлгэц ---------- */
@media (max-width: 640px) {
  #top { height: 48px; padding: 0 8px; gap: 6px; }
  .brand { font-size: 13.5px; }
  #who { display: none; }
  #topbtns { gap: 5px; }
  #topbtns button, #topbtns .btn, #topbtns select { padding: 5px 8px; font-size: 12.5px; }
  .center { inset: 48px 0 0 0; }
  #panel { inset: 48px 0 0 0; width: 100%; border-radius: 0; }
}
/* Утас: «Эрх ба карт холболт» зэрэг мөрүүд — нэр бүтэн мөр, удирдлагууд доор нь */
@media (max-width: 640px) {
  .list-row { flex-wrap: wrap; gap: 6px; font-size: 14px; padding: 10px 2px; }
  .list-row .grow { flex: 1 1 100%; min-width: 0; }
  .list-row .uhead { display: flex; flex: 1 1 100%; align-items: center; gap: 6px; width: 100%; min-width: 0; }
  .list-row .uhead .grow { flex: 1 1 auto; width: auto; }
  .list-row .uhead .danger { padding: 6px 10px; font-size: 15px; }
  .list-row button, .list-row select { flex: 0 0 auto; max-width: 100%; }
  .list-row select { flex: 1 1 140px; min-width: 0; font-size: 13.5px; }
  .list-row button { padding: 8px 13px; font-size: 13.5px; }
  .users-modal .list-row { display: flex; flex-wrap: wrap; font-size: 14px; }
  .users-modal .list-row .uhead { flex: 1 1 100%; }
  .users-modal .list-row .uhead .grow { white-space: normal; overflow: visible; }
  .users-modal .list-row select { font-size: 13.5px; }
  .users-modal .list-row select:last-of-type { flex: 1 1 100%; width: 100%; }
  .modal .mb { padding: 12px 12px; }
}
/* ---------- Оноо / түвшин / лидерүүд ---------- */
.sc-head { display: flex; gap: 14px; align-items: center; }
.sc-ring {
  --p: 0; width: 60px; height: 60px; flex: 0 0 auto; border-radius: 50%;
  display: grid; place-items: center;
  background: conic-gradient(#2fae6a calc(var(--p) * 1%), var(--bg2) 0);
}
.sc-ring::before {
  content: ''; grid-area: 1 / 1; width: 46px; height: 46px; border-radius: 50%;
  background: var(--panel); border: 1px solid var(--line);
}
.sc-ring span { grid-area: 1 / 1; z-index: 1; font-weight: 800; font-size: 18px; }
.sc-hinfo { flex: 1; min-width: 0; }
.sc-lvl { font-size: 16px; font-weight: 800; }
.sc-pts { color: #2fae6a; font-weight: 700; font-size: 13.5px; margin-top: 1px; }
.sc-bar { height: 8px; background: var(--bg2); border-radius: 6px; overflow: hidden; margin-top: 6px; }
.sc-bar i { display: block; height: 100%; background: #2fae6a; border-radius: 6px; }
.sc-next { font-size: 11.5px; color: var(--muted); margin-top: 5px; }
.sc-next b { color: var(--text); }
.sc-track { display: flex; gap: 6px; overflow-x: auto; margin-top: 14px; padding-bottom: 4px; }
.sc-node { position: relative; flex: 0 0 auto; width: 58px; text-align: center; }
.sc-node::before {
  content: ''; position: absolute; top: 15px; left: -50%; width: 100%; height: 2px;
  background: var(--line);
}
.sc-node:first-child::before { display: none; }
.sc-node.done::before, .sc-node.on::before { background: #2fae6a; }
.sc-node i {
  position: relative; display: flex; width: 32px; height: 32px; margin: 0 auto;
  border-radius: 50%; border: 2px solid var(--line); background: var(--panel);
  align-items: center; justify-content: center; font-style: normal;
  font-size: 13px; font-weight: 800; color: var(--muted);
}
.sc-node.done i { border-color: #2fae6a; color: #2fae6a; }
.sc-node.on i { background: #2fae6a; border-color: #2fae6a; color: #fff; }
.sc-node span {
  display: block; font-size: 9px; line-height: 1.15; margin-top: 4px;
  color: var(--muted); word-break: break-word;
}
.sc-node.on span { color: var(--text); font-weight: 700; }
.sc-sec { font-size: 13.5px; font-weight: 800; margin: 16px 0 6px; }
.sc-note {
  font-size: 12.5px; background: rgba(47, 174, 106, .12);
  border: 1px solid rgba(47, 174, 106, .35); border-radius: 10px; padding: 7px 10px;
}
.sc-up { color: #2fae6a; font-weight: 800; }
.sc-dn { color: #d9534f; font-weight: 800; }
.sc-board { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; margin-top: 8px; }
.sc-row {
  display: grid; grid-template-columns: 46px 1fr 94px 58px; gap: 4px; align-items: center;
  padding: 7px 8px; font-size: 12.5px; border-bottom: 1px solid var(--line);
}
.sc-row:last-child { border-bottom: 0; }
.sc-row.head {
  background: var(--bg); color: var(--muted); font-size: 10.5px;
  font-weight: 700; letter-spacing: .03em;
}
.sc-row.me { background: rgba(47, 174, 106, .14); }
.sc-rk { text-align: center; font-weight: 700; }
.sc-nm { display: flex; gap: 5px; align-items: center; overflow: hidden; min-width: 0; }
.sc-nmt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-you {
  background: #2fae6a; color: #fff; font-size: 9px; font-weight: 800;
  border-radius: 8px; padding: 1px 5px; flex: 0 0 auto;
}
.sc-lv {
  color: var(--muted); font-size: 11.5px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.sc-sc { text-align: right; font-weight: 800; }
.sc-hint { font-size: 11px; color: var(--muted); margin-top: 6px; }
.sc-bd {
  display: grid; grid-template-columns: 150px 1fr 52px; gap: 8px;
  align-items: center; font-size: 12.5px; padding: 5px 0;
}
.sc-bd .sc-bar { margin-top: 0; }
.sc-bd b { text-align: right; }
.sc-step, .sc-rule, .sc-rec {
  display: flex; align-items: center; gap: 8px; padding: 6px 0;
  border-bottom: 1px solid var(--line); font-size: 12.5px;
}
.sc-step span, .sc-rule span, .sc-rec span { flex: 1; min-width: 0; }
.sc-plus {
  background: rgba(47, 174, 106, .16); color: var(--text); font-weight: 800;
  font-size: 12px; border-radius: 9px; padding: 2px 8px; flex: 0 0 auto;
}
.sc-cap {
  background: var(--bg2); color: var(--text); font-weight: 800;
  font-size: 12px; border-radius: 9px; padding: 2px 8px; flex: 0 0 auto;
}
.sc-rec small { color: var(--muted); font-size: 10.5px; flex: 0 0 auto; }
/* ── Зурхайн картууд (картын дэлгэрэнгүй) ── */
.zcard { background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:14px 16px; margin-top:10px; box-shadow:0 1px 2px rgba(15,23,42,.04); }
.zh { font-size:11px; font-weight:800; letter-spacing:.6px; text-transform:uppercase; color:#94a3b8; margin-bottom:10px; }
.zrow { display:flex; gap:14px; align-items:flex-start; }
.zrow.zrow-seat { align-items:center; }
.zring { width:60px; height:60px; border-radius:50%; border:2px dashed #cbd5e1; background:#f8fafc; display:flex; align-items:center; justify-content:center; flex:0 0 auto; font-size:28px; line-height:1; }
.zbody { min-width:0; flex:1; }
.zbody h3 { font-size:15.5px; font-weight:800; color:#0f172a; margin:0; }
.zmuted { font-size:11.5px; color:#64748b; margin:3px 0 0; }
.zline { font-size:12.5px; color:#334155; margin:7px 0 0; font-weight:500; }
.zsmall { font-size:11.5px; color:#475569; margin:7px 0 0; line-height:1.55; }
.zsmall.znext { color:#64748b; }
.zfoot { margin-top:12px; padding-top:9px; border-top:1px solid #f1f5f9; font-size:12px; color:#64748b; }
.zlock { font-size:12px; color:#6b7a90; background:#f3f7fd; border:1px dashed #c3d3ee; border-radius:10px; padding:8px 10px; }
.zwheel { position:relative; width:144px; height:144px; flex:0 0 auto; }
.zwring { position:absolute; inset:8px; border-radius:50%; border:1px solid #e2e8f0; }
.zwcenter { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:56px; height:56px; border-radius:50%; background:#fff; border:1px solid #e2e8f0; box-shadow:0 1px 2px rgba(15,23,42,.05); display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:2; }
.zwcenter b { font-size:18px; color:#2563eb; line-height:1; font-weight:800; }
.zwcenter span { font-size:9px; color:#64748b; margin-top:2px; font-weight:500; }
.zwl { position:absolute; transform:translate(-50%,-50%); font-size:10px; font-weight:600; color:#64748b; white-space:nowrap; z-index:3; background:#fff; padding:0 3px; }
.zwl.on { background:#2563eb; color:#fff; padding:2px 7px; border-radius:999px; box-shadow:0 2px 4px rgba(37,99,235,.3); }
.zstrong { color:#0f172a; font-weight:700; }
.znextb { color:#2563eb; font-weight:800; }
.zkvu { padding:2px 0; }
.zkvu.zdiv { margin-top:10px; padding-top:10px; border-top:1px solid #f1f5f9; }
.zkvl { font-size:11px; font-weight:800; color:#94a3b8; letter-spacing:.2px; }
.zkvv { font-size:12.5px; font-weight:600; color:#1e293b; margin-top:3px; line-height:1.5; }
@media (max-width:400px){ .zwheel{width:124px;height:124px} .zwcenter{width:48px;height:48px} .zring{width:52px;height:52px;font-size:24px} .zrow{gap:10px} }
`;

const bootScript = `
window.__postSeen = window.__postSeen || new Map();
window.post = async function (url, data) {
  // ── ДАВХАР БҮРТГЭЛЭЭС СЭРГИЙЛЭХ ─────────────────────────────────────
  // Товчийг 2–3 удаа дарахад ижил хүсэлт 2–3 удаа явж, давхар гишүүн
  // үүсдэг байв. Зөвхөн бичих хүсэлтүүдийг 2 секундын дотор давтахгүй.
  const _u = String(url);
  if (_u === '/api/members' || _u.indexOf('/api/members/') === 0 || _u === '/api/link' || _u.indexOf('/api/link/') === 0) {

    const _key = _u + '|' + JSON.stringify(data || {});
    const _now = Date.now(); const _prev = window.__postSeen.get(_key);
    if (_prev && _now - _prev < 2000) throw new Error('Түр хүлээнэ үү…');
    window.__postSeen.set(_key, _now);
    if (window.__postSeen.size > 40) for (const [k, t] of window.__postSeen) if (_now - t > 60000) window.__postSeen.delete(k);
  }

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data || {})
  });
  const j = await r.json().catch(function () { return {}; });
  if (!r.ok) throw new Error(j.error || ('Алдаа ' + r.status));
  return j;
};
window.getJson = async function (url) {
  const r = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  const j = await r.json().catch(function () { return {}; });
  if (!r.ok) throw new Error(j.error || ('Алдаа ' + r.status));
  return j;
};
let __toastT = null;
window.toast = function (msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(__toastT);
  __toastT = setTimeout(function () { el.classList.add('hidden'); }, 3200);
};
window.escapeHtml = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};
`;

export function loginPage({ theme = 'blue' } = {}) {
  return `<!doctype html>
<html lang="mn" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>iFamily — Нэвтрэх</title>
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#1a7048">
<link rel="icon" type="image/png" href="/icon-192.png">
<link rel="apple-touch-icon" href="/icon-180.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="iFamily">
<style>${CSS}
body { display: flex; align-items: center; justify-content: center; min-height: 100vh;
  background: linear-gradient(160deg, var(--bg) 0%, var(--bg2) 52%, var(--bg3) 100%); }
.authcard { background: #fff; border: 1px solid #e3e8ef; border-radius: 16px; padding: 26px 24px;
  width: 410px; max-width: 94vw; box-shadow: 0 10px 30px rgba(20,40,80,.10); }
.ahead { font-size: 22px; font-weight: 800; color: #1f2d47; }
.asub { color: #6b7a90; font-size: 13.5px; margin: 6px 0 16px; }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.tab { flex: 1; border: 0; border-radius: 999px; padding: 10px 0; font-size: 14.5px;
  font-weight: 650; cursor: pointer; background: #dbe7fb; color: #2b5bbf; font-family: inherit; }
.tab.on { background: #1a73e8; color: #fff; }
.alab { display: block; font-size: 12.5px; font-weight: 650; color: #44536b; margin: 8px 0 4px; }
.ainp { width: 100%; padding: 11px 12px; border: 1px solid #dbe3ee; background: #eff4fa;
  border-radius: 10px; font-size: 14.5px; color: #1f2d47; font-family: inherit; outline: none; }
.ainp:focus { border-color: #1a73e8; background: #fff; }
.abtn { width: 100%; margin-top: 16px; padding: 13px; border: 0; border-radius: 12px;
  background: #1a73e8; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; }
.abtn:hover { background: #1665c9; }
.hint-gray { color: #6b7a90; font-size: 12.5px; margin-top: 12px; text-align: center; }
.hint-gray b { color: #44536b; }
.devnote { font-size: 12px; background: #f3f7fd; border: 1px dashed #c3d3ee; border-radius: 8px;
  padding: 8px 10px; margin-top: 8px; color: #44536b; }
</style>
</head>
<body>
<div class="authcard">
  <div class="ahead">🌳 iFamily</div>
  <div class="asub">Ургийн бичгээ хамтран баяжуулах гэр бүлийн апп.</div>
  <div class="tabs">
    <button type="button" id="tabLogin" class="tab on" onclick="showTab('login')">Нэвтрэх</button>
    <button type="button" id="tabReg" class="tab" onclick="showTab('reg')">Бүртгүүлэх</button>
  </div>
  <div id="paneLogin">
    <label class="alab" for="li_phone">Утасны дугаар</label>
    <input class="ainp" type="tel" id="li_phone" placeholder="88776576" autocomplete="tel"
      onkeydown="if(event.key==='Enter')doLogin()">
    <label class="alab" for="li_pw">Нууц үг</label>
    <input class="ainp" type="password" id="li_pw" autocomplete="current-password"
      onkeydown="if(event.key==='Enter')doLogin()">
    <div id="otpStep" class="hidden">
      <label class="alab" for="li_code">Нэг удаагийн код</label>
      <input class="ainp" type="text" id="li_code" inputmode="numeric" placeholder="6 оронтой код"
        onkeydown="if(event.key==='Enter')doLogin()">
      <label class="alab" for="li_newpw">Шинэ нууц үг</label>
      <input class="ainp" type="password" id="li_newpw" placeholder="Хамгийн багадаа 4 тэмдэгт"
        onkeydown="if(event.key==='Enter')doLogin()">
      <div class="devnote hidden" id="devcode"></div>
    </div>
    <button class="abtn" onclick="doLogin()">Нэвтрэх</button>
    <div class="hint-gray">Нууц үгээ мартсан бол <b>Админ</b>-аас шинэ код авна уу.</div>
  </div>
  <div id="paneReg" class="hidden">
    <label class="alab" for="rg_phone">Утасны дугаар</label>
    <input class="ainp" type="tel" id="rg_phone" placeholder="80200030" autocomplete="tel"
      onkeydown="if(event.key==='Enter')doRegister()">
    <label class="alab" for="rg_name">Нэр</label>
    <input class="ainp" type="text" id="rg_name" placeholder="Таны нэр"
      onkeydown="if(event.key==='Enter')doRegister()">
    <label class="alab" for="rg_pw">Нууц үг</label>
    <input class="ainp" type="password" id="rg_pw" autocomplete="new-password"
      onkeydown="if(event.key==='Enter')doRegister()">
    <label class="alab" for="rg_pw2">Нууц үг давтах</label>
    <input class="ainp" type="password" id="rg_pw2" autocomplete="new-password"
      onkeydown="if(event.key==='Enter')doRegister()">
    <button class="abtn" onclick="doRegister()">Бүртгүүлэх</button>
  </div>
</div>
<script>${bootScript}
function showTab(t) {
  const L = t === 'login';
  tabLogin.classList.toggle('on', L);
  tabReg.classList.toggle('on', !L);
  paneLogin.classList.toggle('hidden', !L);
  paneReg.classList.toggle('hidden', L);
}
let NEED_OTP = false;
async function doLogin() {
  const phone = li_phone.value.trim();
  const password = li_pw.value;
  if (!phone) return toast('Утасны дугаараа оруулна уу');
  try {
    const payload = { phone, password };
    if (NEED_OTP) { payload.code = li_code.value.trim(); payload.new_password = li_newpw.value; }
    const j = await post('/api/login', payload);
    if (j.need_otp) {
      NEED_OTP = true;
      otpStep.classList.remove('hidden');
      devcode.classList.remove('hidden');
      if (j.dev) {
        li_code.value = j.dev;
        devcode.textContent = 'Хөгжүүлэлтийн нэг удаагийн код: ' + j.dev;
      } else {
        devcode.textContent = 'Нэг удаагийн код илгээлээ — код болон шинэ нууц үгээ оруулаад дахин «Нэвтрэх» дарна уу.';
      }
      li_newpw.focus();
      return;
    }
    location.href = '/';
  } catch (e) { toast(e.message); }
}
async function doRegister() {
  const phone = rg_phone.value.trim();
  const name = rg_name.value.trim();
  const pw = rg_pw.value;
  const pw2 = rg_pw2.value;
  if (!phone) return toast('Утасны дугаараа оруулна уу');
  if (!name) return toast('Нэрээ оруулна уу');
  if (pw.length < 4) return toast('Нууц үг хамгийн багадаа 4 тэмдэгт байх ёстой');
  if (pw !== pw2) return toast('Нууц үг таарахгүй байна');
  try {
    await post('/api/register', { phone, name, password: pw, confirm: pw2 });
    location.href = '/';
  } catch (e) { toast(e.message); }
}
</script>
</body>
</html>`;
}

export function appPage({ state, theme = 'blue', card = 'round' }) {
  const s = JSON.stringify(state).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="mn" data-theme="${theme}" data-card="${card}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>iFamily — Ургийн мод</title>
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#1a7048">
<link rel="icon" type="image/png" href="/icon-192.png">
<link rel="apple-touch-icon" href="/icon-180.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="iFamily">
<link rel="apple-touch-startup-image" href="/splash/splash-430x932-3x.jpg" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/splash/splash-428x926-3x.jpg" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/splash/splash-393x852-3x.jpg" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/splash/splash-390x844-3x.jpg" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/splash/splash-375x812-3x.jpg" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/splash/splash-414x896-3x.jpg" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/splash/splash-414x896-2x.jpg" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/splash/splash-375x667-2x.jpg" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/splash/splash-1024x1366-2x.jpg" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/splash/splash-834x1194-2x.jpg" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/splash/splash-820x1180-2x.jpg" media="(device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/splash/splash-768x1024-2x.jpg" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<style>${CSS}</style>
</head>
<body>
<div id="splash"><img src="/icon-512.png" alt="iFamily"><div class="spt">iFamily</div><div class="spsub">Угийн мод</div><div class="sps"></div></div>
<script>window.addEventListener('load',function(){setTimeout(function(){var s=document.getElementById('splash');if(s){s.style.opacity='0';setTimeout(function(){s.remove()},350)}},450);setTimeout(function(){var s=document.getElementById('splash');if(s)s.remove()},9000)});</script>
<header id="top">
  <div class="brand">🌳 iFamily</div>
  <div id="topbtns"></div>
  <div id="who"></div>
</header>
<main id="viewport">
  <div id="world">
    <svg id="links"></svg>
    <div id="cards"></div>
  </div>
  <div id="empty" class="center hidden">
    <h1>Мод хоосон байна</h1>
    <p>Ургийн модоо эхлүүлэх анхны гишүүнээ нэмнэ үү.</p>
    <button class="primary" id="firstBtn">＋ Анхны гишүүн нэмэх</button>
  </div>
  <div id="waiting" class="center hidden">
    <h1>Холболт хүлээж буй</h1>
    <p>Таны утасны дугаараар модтой холбогдсон карт олдоогүй байна.<br>Мод дээрх бүх нэрээс <b>өөрийн нэрээ</b> сонгон «Карт холбох хүсэлт» илгээнэ үү.</p>
    <button class="primary" onclick="window.__linkReq()">📇 Карт холбох хүсэлт илгээх</button>
    <div id="lr_status" style="margin-top:12px;font-size:13px"></div>
  </div>
</main>
<aside id="panel" class="hidden"></aside>
<div id="modalroot" class="hidden"></div>
<div id="menu" class="hidden"></div>
<script>window.__STATE__ = ${s};</script>
<script>${bootScript}</script>
<script src="/tree_client.js?v=358"></script>
</body>
</html>`;
}

export function notFoundPage() {
  return `<!doctype html><html lang="mn"><head><meta charset="utf-8"><title>Олдохгүй</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style></head>
<body><div style="text-align:center"><h1>🌳 iFamily</h1><p>Энэ холбоос идэвхгүй байна.</p></div></body></html>`;
}
