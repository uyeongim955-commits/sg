// 성좌게임 SVG 워커 sg v4 — 단일 파일, import 없음 (Cloudflare Workers 모듈 문법)
//   / 또는 /f  플레이어넷   목록: ?d=7/6+14:20&o=카더라주의&l=!제목~닉;?제목~*닉;제목~닉
//                         글  : ?t=제목&w=닉&d=7/6+14:20&s=본문&c=ㅇㅇ~댓글;↳ㅇㅇ~반박
//                         디자인은 여명각인 dawn 커뮤니티(만화인사이드)와 같음. 바뀐 건 아래 SITE 문구뿐
//   /s  공략 현황판       ?d=7/6+14:20&z=0120&u=중&k=*이름~1;하준~1&h=공지
// 응답은 전부 image/svg+xml. 마크다운 ![](URL) 로 그대로 표시된다.

// ── 게시판 문구 (여기만 고치면 이름이 바뀜) ──
const SITE = {
  name: '플레이어넷', suffix: '.com',              // 원본: 만화인사이드 .com
  minor: '마이너 갤러리',
  search: '갤러리 통합검색',
  nav: ['갤러리', '마이너갤', '미니갤', '공략갤', '갤로그'],   // 원본: … 만화갤 …
  navRight: '제773회 진행 중 · 스포일러 주의',      // 원본: 연재 중 · 스포일러 주의
  gallery: '제773회 성좌게임 갤러리',               // 원본: 새벽의 태양 갤러리
  footer: '플레이어넷 · 제773회 성좌게임 마이너 갤러리 · 게시물은 플레이어 개인 의견이며 스포일러를 포함할 수 있음',
  admin: '운영자', must: '필독'
};

const FONT = "Pretendard,'Apple SD Gothic Neo','Noto Sans KR','Noto Sans CJK KR','Malgun Gothic',sans-serif";
const W = 720;    // 현황판·안내 카드 폭
const BW = 1000;  // 게시판 폭(원본과 같은 비율)

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const q = url.searchParams;
    const path = url.pathname.replace(/\/+$/, '') || '/';
    let svg;
    try {
      if (path === '/s') svg = statusBoard(q);
      else if (path === '/f' || path === '/') {
        if (q.get('l') !== null) svg = boardList(q);
        else if (q.get('t') !== null || q.get('s') !== null) svg = boardPost(q);
        else svg = help();
      } else svg = help();
    } catch (err) {
      svg = errorCard(err);
    }
    return new Response(svg, {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=604800, immutable',
        'access-control-allow-origin': '*',
        'x-content-type-options': 'nosniff'
      }
    });
  }
};

// ───────────────────────── 공통 도구 ─────────────────────────
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (s, max = 400) => Array.from(String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('');

function charWidth(ch) {
  const c = ch.codePointAt(0);
  if (c === 0xfe0f || c === 0x200d) return 0;
  if (c < 0x80) {
    if (ch === ' ') return 0.3;
    if ('il.,:;\'|!`'.includes(ch)) return 0.28;
    if ('mwMW@'.includes(ch)) return 0.86;
    if ('()[]'.includes(ch)) return 0.34;
    if (/[0-9]/.test(ch)) return 0.58;
    if (/[A-Z]/.test(ch)) return 0.62;
    return 0.53;
  }
  if (c >= 0x1f000) return 1.15;                       // 이모지
  if (c >= 0x2190 && c <= 0x2bff) return 1.0;          // 기호·화살표
  if (c >= 0x3130 && c <= 0x318f) return 0.92;         // 한글 자모(ㅋㅋ)
  return 0.93;                                         // 한글·한자 등
}
const measure = (s, size) => Array.from(s).reduce((a, ch) => a + charWidth(ch), 0) * size;

// 원본 dawn 워커식 폭 어림(한글 1.06em·공백 0.3em·영숫자 0.55em).
// [댓글수]·M 배지 위치와 본문 줄바꿈 길이가 원본과 같게 나오도록 이걸 쓴다
function dEst(s, size) {
  let w = 0;
  for (const ch of Array.from(s)) {
    const c = ch.codePointAt(0);
    w += ch === ' ' ? 0.3 : c < 0x80 ? 0.55 : 1.06;
  }
  return w * size;
}

function truncate(s, size, max) {
  if (measure(s, size) <= max) return s;
  let out = '';
  for (const ch of Array.from(s)) {
    if (measure(out + ch + '…', size) > max) break;
    out += ch;
  }
  return out + '…';
}

// 단어 단위 줄바꿈(긴 단어는 글자 단위). fit(문자열) 이 폭 판정
function wrapBy(s, fit, maxLines = 99) {
  const lines = [];
  let line = '';
  for (const word of s.split(' ')) {
    const cand = line ? line + ' ' + word : word;
    if (fit(cand)) { line = cand; continue; }
    if (line) { lines.push(line); line = ''; }
    if (fit(word)) { line = word; continue; }
    for (const ch of Array.from(word)) {
      if (!fit(line + ch)) { lines.push(line); line = ''; }
      line += ch;
    }
  }
  if (line) lines.push(line);
  if (!lines.length) lines.push('');
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last && !fit(last + '…')) last = Array.from(last).slice(0, -1).join('');
    kept[maxLines - 1] = last + '…';
    return kept;
  }
  return lines;
}
const wrap = (s, size, max, maxLines) => wrapBy(s, t => measure(t, size) <= max, maxLines);

function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const pick = (seed, min, max) => min + (hash(seed) % (max - min + 1));
const comma = n => n.toLocaleString('en-US');

const T = (x, y, size, fill, text, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${esc(text)}</text>`;
const R = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;

function frame(h, body, bg = '#eef1f6', w = W) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}">` +
    `<rect width="${w}" height="${h}" fill="${bg}"/>${body}</svg>`;
}

// 안내·오류 카드용 머리띠
function header(title, right) {
  return `<rect width="${W}" height="64" fill="#18213d"/>` +
    `<rect y="64" width="${W}" height="3" fill="#c9a24a"/>` +
    T(28, 41, 24, '#ffffff', '✦', 'font-weight="700"') +
    T(58, 41, 22, '#ffffff', title, 'font-weight="700" letter-spacing="-0.5"') +
    (right ? T(W - 28, 40, 16, '#aeb9d6', right, 'text-anchor="end"') : '');
}

// 본문 속 "C 급"(원래 C+급) 복원 — URL에선 +가 공백으로 풀림
const fixPlus = t => t.replace(/(^|[^A-Za-z])(EX|[A-FS]) (?=급)/g, '$1$2+');

// ───────────────────────── 플레이어넷 (dawn 커뮤니티 디자인) ─────────────────────────
const C = {
  navy: '#3b4a8d', icon: '#3e4b86',
  logo: '#1f2330', logoSub: '#8f92a1', minor: '#90949d', placeholder: '#9da0a7',
  navRight: '#b5bff2', title: '#13171a', badgeBg: '#e8ebf4', badgeFg: '#505579',
  divider: '#e8e9ed', tableTop: '#e1e3e8', headBg: '#f7f8fa', headText: '#6e7279',
  noticeBg: '#fbfbfd', noticeIcon: '#e0684f', noticeText: '#202330', adminText: '#363c4a',
  rowLine: '#eef0f3', tableEnd: '#e6e8ec', num: '#979aa2', tag: '#6e7279', rowTitle: '#23282e',
  cnt: '#c0392b', sqRed: '#e97c66', sqGreen: '#6fb07b', gonick: '#383c47', nick: '#74787d', ip: '#aeb1b6',
  cell: '#73777c', footer: '#aeb2b6',
  postTitle: '#13161a', meta: '#8e9296', metaName: '#373c47', sep: '#e9ebef', body: '#242527',
  upBg: '#feecec', upLine: '#f0cfca', upText: '#bf4a3f', downBg: '#eef1f6', downLine: '#dde2ea', downText: '#6d747a',
  label: '#141719', cmtNick: '#42474a', cmtText: '#2e2f31', reply: '#bbbcc0'
};
const Y0 = 26;          // 검색창 윗변
const L = 36, RT = 964; // 본문 좌우 끝

const titleKey = text => text.replace(/\s+/g, '');

// 닉: "*고닉" → 아이콘+굵은 이름 / "ㅇㅇ"·"유동닉" → 이름(IP 자동). "ㅇㅇ(12.34)"처럼 주면 그 IP 사용
function parseNick(raw, seed = '') {
  let s = clean(raw, 40);
  const fixed = s.startsWith('*');
  if (fixed) s = s.slice(1).trim();
  s = s.replace(/@\s*(EX|[A-FS])(\+|\s)?\s*$/i, '').trim();          // 예전 등급 표기는 버림
  let ip = '';
  const m = s.match(/^(.*?)\(\s*(\d{1,3}(?:\.\d{1,3})?)\s*\)\s*$/);
  if (m) { s = m[1].trim(); ip = m[2]; }
  else s = s.replace(/\([^)]*\)\s*$/, '').trim();
  const name = clean(s, 16) || (fixed ? '고닉' : 'ㅇㅇ');
  if (!fixed && !ip) { const h = hash('ip|' + name + '|' + seed); ip = `${100 + (h % 124)}.${(h >>> 8) % 256}`; }
  return { name, ip: fixed ? '' : `(${ip})`, fixed };
}

function personIcon(x, top) {
  return `<g transform="translate(${x} ${top})"><rect width="13" height="13" rx="2.6" fill="${C.icon}"/>` +
    `<circle cx="6.5" cy="4.9" r="2.3" fill="#fff"/><path d="M2.9 11.3c.3-2.3 1.8-3.6 3.6-3.6s3.3 1.3 3.6 3.6z" fill="#fff"/></g>`;
}

// 닉 묶음 폭 / 그리기. style: 'list'(목록 글쓴이) | 'post'(글·댓글)
const BOLD = 1.04;
function nickWidth(n, size = 13) {
  return n.fixed ? 19 + measure(n.name, size) * BOLD : measure(n.name, size) * (BOLD) + measure(n.ip, size);
}
// 목록 글쓴이 칸이 옆 칸을 침범하지 않게 이름만 줄임(IP는 유지)
function fitNick(n, maxW, size = 13) {
  if (nickWidth(n, size) <= maxW) return n;
  const room = maxW - (n.fixed ? 19 : measure(n.ip, size)) ;
  return { ...n, name: truncate(n.name, size * BOLD, room) };
}
function nickSVG(x, base, n, style, size = 13) {
  if (n.fixed) {
    return personIcon(x, base - 11.4) +
      T(x + 19, base, size, style === 'list' ? C.gonick : C.metaName, n.name, 'font-weight="700"');
  }
  const nameFill = style === 'list' ? C.nick : C.cmtNick;
  const weight = style === 'list' ? '400' : '700';
  return `<text x="${x}" y="${base}" font-size="${size}" fill="${nameFill}" font-weight="${weight}">${esc(n.name)}` +
    `<tspan fill="${C.ip}" font-weight="400">${esc(n.ip)}</tspan></text>`;
}

// 목록 행과 글 화면이 같은 수치를 쓰도록 제목으로 시드
function postStats(text, concept) {
  const seed = '#' + titleKey(text);
  const views = pick(seed + 'v', 240, 9200);
  const recs = concept ? pick(seed + 'r', 30, 160) : pick(seed + 'r', 0, 60);
  const down = pick(seed + 'd', 0, Math.max(3, Math.floor(recs / 3)));
  const cmts = pick(seed + 'c', 0, 14);            // 2 미만이면 목록에 [n] 안 붙음
  return { views, recs, down, cmts };
}

function titleParts(raw) {
  let t = fixPlus(clean(raw, 80)) || '제목 없음';
  let tag = '';
  if (t.startsWith('!')) { tag = '개념'; t = t.slice(1).trim(); }
  else if (t.startsWith('?')) { tag = '질문'; t = t.slice(1).trim(); }
  return { tag, text: t || '제목 없음' };
}

function timeMinus(d, i) {
  const m = String(d).match(/(\d{1,2}):(\d{2})/);
  if (!m) return String(d).split(' ')[0] || '';
  let t = ((+m[1]) * 60 + (+m[2]) - i) % 1440;
  if (t < 0) t += 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// 공통 머리: 로고·검색창·네이비 메뉴·갤러리 제목·M 배지·구분선
function boardHead() {
  let s = `<text x="${L}" y="${Y0 + 20.5}" font-size="22" font-weight="800" fill="${C.logo}">${esc(SITE.name)}` +
    `<tspan fill="${C.logoSub}" font-weight="600">${esc(SITE.suffix)}</tspan></text>`;
  s += T(239, Y0 + 21.5, 12, C.minor, SITE.minor, 'font-weight="600"');
  s += `<rect x="429.75" y="${Y0 + 0.75}" width="300.5" height="30.5" rx="2" fill="#fff" stroke="${C.navy}" stroke-width="1.5"/>` +
    `<rect x="700.5" y="${Y0}" width="31" height="32" rx="2" fill="${C.navy}"/>` +
    `<circle cx="714.3" cy="${Y0 + 14.3}" r="5.3" fill="none" stroke="#fff" stroke-width="1.9"/>` +
    `<path d="M718.2 ${Y0 + 18.2}l4.3 4.3" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>` +
    T(444.5, Y0 + 21.5, 13, C.placeholder, SITE.search);
  s += R(0, Y0 + 40, BW, 37, C.navy);
  let x = L;
  for (const item of SITE.nav) { s += T(x, Y0 + 65, 13, '#ffffff', item, 'font-weight="700"'); x += measure(item, 13) * BOLD + 41.5; }
  s += T(RT, Y0 + 65, 12, C.navRight, SITE.navRight, 'text-anchor="end"');
  s += T(L, Y0 + 114.5, 24, C.title, SITE.gallery, 'font-weight="800"');
  const bx = L + dEst(SITE.gallery, 24) + 13;
  s += `<circle cx="${bx.toFixed(1)}" cy="${Y0 + 106.8}" r="10" fill="${C.badgeBg}"/>` +
    T(bx.toFixed(1), Y0 + 110.9, 11, C.badgeFg, 'M', 'text-anchor="middle" font-weight="700"');
  s += R(L, Y0 + 132, RT - L, 2, C.divider);
  return s;
}

function boardFoot(contentBottom) {
  const fy = Math.max(Y0 + 611.5, contentBottom + 50);
  return { svg: T(L, fy, 11, C.footer, SITE.footer), h: Math.ceil(fy + 22.5) };
}

// 목록 열 위치(가운데 정렬 기준점)
const COL = { num: 69, tag: 147, title: 196, writer: 711, date: 827.5, views: 891, recs: 944 };
const ROW_H = 34;

// ───────────────────────── 목록 ─────────────────────────
function boardList(q) {
  const date = clean(q.get('d'), 20);
  const notice = clean(q.get('o'), 40);
  const items = String(q.get('l') ?? '').slice(0, 1600).split(';').filter(x => x.trim()).slice(0, 8);
  let s = boardHead();
  const top = Y0 + 152;
  s += R(L, top, RT - L, 2, C.tableTop) + R(L, top + 2, RT - L, 31, C.headBg);
  const hb = top + 21.5;
  const head = (x, t, anchor = 'middle') => T(x, hb, 12, C.headText, t, `text-anchor="${anchor}" font-weight="500"`);
  s += head(COL.num, '번호') + head(COL.tag, '말머리') + head(COL.title, '제목', 'start') +
    head(COL.writer, '글쓴이') + head(COL.date, '작성일') + head(COL.views, '조회') + head(COL.recs, '추천');
  let y = top + 33;
  const cellText = (x, b, t, fill, extra = '') => T(x, b, 13, fill, t, `text-anchor="middle" ${extra}`);

  if (notice) {
    const b = y + 21;
    s += R(L, y, RT - L, ROW_H, C.noticeBg);
    s += cellText(COL.num, b, '공지', C.num) + cellText(COL.tag, b, '공지', C.tag, 'font-weight="600"');
    s += `<circle cx="202.4" cy="${(b - 4.6).toFixed(1)}" r="7" fill="${C.noticeIcon}"/>` +
      T(202.4, b - 0.6, 11, '#fff', '!', 'text-anchor="middle" font-weight="800"');
    s += T(217.5, b, 14, C.noticeText, truncate(notice, 14, 400), 'font-weight="700"');
    const adm = { name: SITE.admin, ip: '', fixed: true };
    const aw = nickWidth(adm);
    s += personIcon(COL.writer - aw / 2, b - 11.4) + T(COL.writer - aw / 2 + 19, b, 13, C.adminText, SITE.admin, 'font-weight="700"');
    s += cellText(COL.date, b, SITE.must, C.num) + T(COL.views, b, 16, C.num, '–', 'text-anchor="middle"') + T(COL.recs, b, 16, C.num, '–', 'text-anchor="middle"');
    y += ROW_H;
    s += R(L, y - 0.5, RT - L, 1, C.rowLine);
  }

  const base = 1000000 + (hash('n|' + date) % 900000);
  items.forEach((raw, i) => {
    const cut = raw.lastIndexOf('~');                 // 제목 속 ~ 는 살리고 마지막 ~ 뒤를 닉으로
    const { tag, text } = titleParts(cut >= 0 ? raw.slice(0, cut) : raw);
    const nick = fitNick(parseNick(cut >= 0 ? raw.slice(cut + 1) : '', titleKey(text)), 150);
    const st = postStats(text, tag === '개념');
    const b = y + 21.3;
    s += cellText(COL.num, b, String(base - i), C.num);
    s += cellText(COL.tag, b, tag === '질문' ? '질문' : '일반', C.tag, 'font-weight="600"');
    s += R(COL.title - 0.4, b - 10.6, 10.5, 10.5, tag === '개념' ? C.sqRed : C.sqGreen);
    const nw = nickWidth(nick);
    const titleRight = COL.writer - nw / 2 - 22;
    const cntLabel = st.cmts >= 2 ? `[${st.cmts}]` : '';
    const cntW = cntLabel ? measure(cntLabel, 13) + 10 : 0;
    const shown = truncate(text, 15, titleRight - 217 - cntW);
    s += T(217, b, 15, C.rowTitle, shown);
    if (cntLabel) {
      const cx = Math.min(217 + dEst(shown, 15) + 8, titleRight - cntW + 10);
      s += T(cx.toFixed(1), b, 13, C.cnt, cntLabel, 'font-weight="700"');
    }
    s += nickSVG(COL.writer - nw / 2, b, nick, 'list');
    s += cellText(COL.date, b, timeMinus(date, i), C.cell) + cellText(COL.views, b, comma(st.views), C.cell) +
      cellText(COL.recs, b, String(st.recs), C.cell);
    y += ROW_H;
    s += R(L, y - 0.5, RT - L, 1, i === items.length - 1 ? C.tableEnd : C.rowLine);
  });
  if (!items.length) { s += T(500, y + 22, 14, C.num, '게시물이 없습니다', 'text-anchor="middle"'); y += ROW_H; }

  const by = y + 11.7;
  s += `<rect x="874" y="${by.toFixed(1)}" width="90" height="30.7" rx="3" fill="${C.navy}"/>` +
    T(919, (by + 20.6).toFixed(1), 14, '#fff', '글쓰기', 'text-anchor="middle" font-weight="700"');
  const f = boardFoot(by + 30.7);
  return frame(f.h, s + f.svg, '#ffffff', BW);
}

// ───────────────────────── 글 ─────────────────────────
function boardPost(q) {
  const { tag, text } = titleParts(q.get('t'));
  const nick = parseNick(q.get('w'), titleKey(text));            // 목록 행과 같은 IP
  const date = clean(q.get('d'), 20);
  const bodyText = fixPlus(clean(q.get('s'), 900));
  const comments = String(q.get('c') ?? '').slice(0, 2000).split(';').filter(x => x.trim()).slice(0, 10);
  const st = postStats(text, tag === '개념');

  let s = boardHead();
  // 제목(길면 2줄)
  const tLines = wrap(text, 22, RT - L, 2);
  let y = Y0 + 184;
  tLines.forEach((ln, i) => { s += T(L, y + i * 30, 22, C.postTitle, ln, 'font-weight="800"'); });
  y += (tLines.length - 1) * 30;
  // 작성자 · 날짜 · 조회 · 추천
  const mb = y + 31.7;
  s += nickSVG(L, mb, nick, 'post');
  const meta = `· ${date ? date + ' · ' : ''}조회 ${comma(st.views)} · 추천 ${st.recs}`;
  s += T((L + nickWidth(nick) + 12).toFixed(1), mb, 13, C.meta, meta);
  const sep1 = mb + 11.6;
  s += R(L, sep1, RT - L, 1, C.sep);
  // 본문 — 원본처럼 dEst 기준으로 줄을 끊는다
  const bLines = wrapBy(bodyText || ' ', t => dEst(t, 17) <= RT - L, 14);
  const b0 = sep1 + 22.2;
  bLines.forEach((ln, i) => { s += T(L, (b0 + i * 30.6).toFixed(1), 17, C.body, ln); });
  const sep2 = b0 + (bLines.length - 1) * 30.6 + 17;
  s += R(L, sep2.toFixed(1), RT - L, 1, C.sep);
  // 추천·비추 알약
  const py = sep2 + 6.4;
  const pill = (x, bg, line, fg, label) =>
    `<rect x="${x + 0.5}" y="${(py + 0.5).toFixed(1)}" width="109" height="41.3" rx="20.6" fill="${bg}" stroke="${line}"/>` +
    T(x + 55, (py + 27.6).toFixed(1), 15, fg, label, 'text-anchor="middle" font-weight="700"');
  s += pill(384, C.upBg, C.upLine, C.upText, `▲ ${st.recs}`) + pill(506, C.downBg, C.downLine, C.downText, `▼ ${st.down}`);
  // 댓글 머리
  const lb = py + 51;
  s += R(35, (lb - 15).toFixed(1), 3.2, 15, C.navy) +
    T(50, lb.toFixed(1), 15, C.label, `댓글 ${comments.length}`, 'font-weight="700"');
  const lsep = lb + 9.3;
  s += R(L, lsep.toFixed(1), RT - L, 1, C.sep);
  // 댓글 줄
  let cb = lsep + 26;
  let bottom = lsep + 1;
  comments.forEach((raw, i) => {
    const reply = /^\s*(↳|ㄴ|>)/.test(raw);
    const r = raw.replace(/^\s*(↳|ㄴ|>)\s*/, '');
    const cut = r.indexOf('~');                       // 닉~댓글: 첫 ~ 앞이 닉
    const ct = fixPlus(clean(cut >= 0 ? r.slice(cut + 1) : r, 200));
    const cn = parseNick(cut >= 0 ? r.slice(0, cut) : 'ㅇㅇ', 'c' + i + ct);
    let x = L;
    if (reply) { s += T(38, cb.toFixed(1), 13, C.reply, 'ㄴ'); x = 62; }
    s += nickSVG(x, cb.toFixed(1), cn, 'post');
    const tx = x + nickWidth(cn) + 20;
    s += T(tx.toFixed(1), cb.toFixed(1), 15, C.cmtText, truncate(ct, 15, RT - tx));
    s += R(L, (cb + 7).toFixed(1), RT - L, 1, C.rowLine);
    bottom = cb + 8;
    cb += 28;
  });
  const f = boardFoot(bottom);
  return frame(f.h, s + f.svg, '#ffffff', BW);
}

// ───────────────────────── /s 공략 현황판 ─────────────────────────
const ZONES = {
  서: { dir: '서부권', name: '마녀의 숲', boss: '모르간', grade: 'S', base: '마녀의 탑', color: '#8fd3a3' },
  남: { dir: '남부권', name: '철의 성채', boss: '아퀼라', grade: 'S+', base: '검총', color: '#e9c27a' },
  동: { dir: '동부권', name: '신성한 화산', boss: '라그나', grade: 'S+', base: '불의 기둥', color: '#ff8e66' },
  북: { dir: '북부권', name: '심연의 화원', boss: '카오스', grade: 'EX', base: '심연의 성소', color: '#c4a2fa' }
};
const ORDER = ['서', '남', '동', '북'];
const STATE = ['미공략', '공략 중', '격파'];

function stars(h) {
  let s = '';
  let seed = 773;
  const r = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 70; i++) {
    const x = (r() * W).toFixed(1), y = (r() * h).toFixed(1), o = (0.15 + r() * 0.55).toFixed(2), rad = r() > 0.9 ? 1.6 : 0.9;
    s += `<circle cx="${x}" cy="${y}" r="${rad}" fill="#cfe6ff" opacity="${o}"/>`;
  }
  return s;
}

function zoneTile(x, y, w, h, key, state, here, compact) {
  const z = ZONES[key];
  const col = z.color;
  const fill = state === 2 ? '#2a2412' : state === 1 ? '#1d1a14' : '#131c2c';
  const stroke = state === 2 ? '#d4af37' : state === 1 ? col : '#2f3d55';
  const dim = state === 0 ? '.62' : '1';
  const nameSize = compact ? 17 : 19;
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="${state === 0 ? 1.5 : 3}"/>`;
  if (state === 1) s += `<rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="10" fill="none" stroke="${col}" stroke-opacity=".4" stroke-dasharray="4 4"/>`;
  s += T(x + 12, y + 22, 12, col, z.dir, `font-weight="700" letter-spacing="1" opacity="${dim}"`);
  s += T(x + 12, y + 46, nameSize, '#f1f4fa', truncate(z.name, nameSize, w - 24), `font-weight="800" opacity="${dim}"`);
  const bossText = `${z.boss} · ${z.grade}`;
  s += T(x + 12, y + 67, 14, state === 2 ? '#bda56a' : '#c3cbe0', bossText, `opacity="${dim}"`);
  if (state === 2) s += `<rect x="${x + 12}" y="${y + 62}" width="${measure(bossText, 14)}" height="2" fill="#d4af37"/>`;
  s += compact ? T(x + 12, y + 86, 12, '#7f8aa6', z.base, `opacity="${dim}"`) : T(x + w - 12, y + h - 16, 12, '#7f8aa6', z.base, `text-anchor="end" opacity="${dim}"`);
  if (state === 2) {
    s += `<g transform="translate(${x + 44} ${y + h - 20}) rotate(-8)"><rect x="-32" y="-14" width="64" height="28" rx="6" fill="#1a1608" stroke="#d4af37" stroke-width="2.5"/>` +
      T(0, 6, 16, '#d4af37', '격파', 'text-anchor="middle" font-weight="900" letter-spacing="3"') + '</g>';
  } else {
    const chip = STATE[state];
    const cw = measure(chip, 12) + 16;
    s += `<rect x="${x + 12}" y="${y + h - 30}" width="${cw}" height="20" rx="10" fill="${state === 1 ? col : '#2a3550'}"/>` +
      T(x + 12 + cw / 2, y + h - 16, 12, state === 1 ? '#14100a' : '#9aa6c2', chip, 'text-anchor="middle" font-weight="800"');
  }
  if (here) s += hereBadge(x + w - 8, y + 8);
  return s;
}
function hereBadge(rx, y) {
  const w = 62;
  return `<rect x="${rx - w}" y="${y}" width="${w}" height="20" rx="10" fill="#71e7e9"/>` +
    T(rx - w / 2, y + 14, 11, '#06222a', '📍현위치', 'text-anchor="middle" font-weight="800"');
}

function statusBoard(q) {
  const date = clean(q.get('d'), 20);
  const zRaw = (clean(q.get('z'), 8).replace(/[^0-2]/g, '') + '0000').slice(0, 4);
  const states = Object.fromEntries(ORDER.map((k, i) => [k, Number(zRaw[i])]));
  const here = clean(q.get('u'), 4).slice(0, 1);
  const head = clean(q.get('h'), 60);
  const ranks = clean(q.get('k'), 300).split(';').map(s => s.trim()).filter(Boolean).slice(0, 6).map(r => {
    const cut = r.indexOf('~');
    let name = (cut >= 0 ? r.slice(0, cut) : r).trim();
    const me = name.startsWith('*');
    if (me) name = name.slice(1).trim();
    const n = Math.max(0, Math.min(4, parseInt(cut >= 0 ? r.slice(cut + 1) : '0', 10) || 0));
    return { name: clean(name, 10) || '?', n, me };
  });
  const cleared = ORDER.filter(k => states[k] === 2).length;
  const H = 586;
  let s = `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1120"/><stop offset="1" stop-color="#121d33"/></linearGradient>` +
    `<radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#71e7e9" stop-opacity=".2"/><stop offset="1" stop-color="#71e7e9" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#bg)"/>` + stars(H);
  // 헤더
  s += T(28, 40, 13, '#71e7e9', '✦ 제773회 성좌게임', 'font-weight="700" letter-spacing="2"') +
    T(28, 76, 30, '#ffffff', '공략 현황', 'font-weight="800" letter-spacing="-1"') +
    T(W - 28, 40, 15, '#9fb0cf', date, 'text-anchor="end"') +
    T(W - 28, 72, 15, '#d4af37', `격파 ${cleared} / 4`, 'text-anchor="end" font-weight="800" letter-spacing="1"');
  s += `<rect x="28" y="92" width="${W - 56}" height="1" fill="#2a3a58"/>`;
  // 지도(십자): 서·중·동 한 줄, 북·남은 위아래
  const ox = 28, oy = 112, sw = 130, cw = 120, gap = 8, topW = 204, topH = 108, midH = 132;
  const cx0 = ox + sw + gap, midY = oy + topH + gap;
  s += `<circle cx="${cx0 + cw / 2}" cy="${midY + midH / 2}" r="170" fill="url(#glow)"/>`;
  s += zoneTile(cx0 + cw / 2 - topW / 2, oy, topW, topH, '북', states['북'], here === '북', false);
  s += zoneTile(ox, midY, sw, midH, '서', states['서'], here === '서', true);
  s += zoneTile(cx0 + cw + gap, midY, sw, midH, '동', states['동'], here === '동', true);
  s += zoneTile(cx0 + cw / 2 - topW / 2, midY + midH + gap, topW, topH, '남', states['남'], here === '남', false);
  s += `<rect x="${cx0}" y="${midY}" width="${cw}" height="${midH}" rx="16" fill="#0f2a33" stroke="#71e7e9" stroke-width="2.5"/>` +
    T(cx0 + cw / 2, midY + 34, 12, '#71e7e9', '중앙권', 'text-anchor="middle" font-weight="700" letter-spacing="1"') +
    T(cx0 + cw / 2, midY + 66, 18, '#ffffff', '서울시청', 'text-anchor="middle" font-weight="800"') +
    T(cx0 + cw / 2, midY + 90, 13, '#9fd7da', '연합 본부', 'text-anchor="middle"');
  if (here === '중') s += hereBadge(cx0 + cw / 2 + 31, midY + midH - 28);
  // 우측: 최후의 일격
  const px = 452, py = 112, pw = W - px - 28;
  const panelH = 72 + Math.max(1, ranks.length) * 38;
  s += `<rect x="${px}" y="${py}" width="${pw}" height="${panelH}" rx="14" fill="#0e1729" stroke="#2a3a58"/>` +
    T(px + 18, py + 34, 16, '#ffffff', '최후의 일격', 'font-weight="800"') +
    T(px + pw - 18, py + 34, 12, '#7f8aa6', '보스당 1회', 'text-anchor="end"');
  if (!ranks.length) s += T(px + 18, py + 76, 14, '#7f8aa6', '기록 없음');
  const sorted = ranks.slice().sort((a, b) => b.n - a.n);
  const top = sorted.length ? sorted[0].n : 0;
  sorted.forEach((r, i) => {
    const ry = py + 74 + i * 38;
    const nameText = truncate((r.me ? '✦ ' : '') + r.name, 15, 86);
    s += T(px + 18, ry, 15, r.me ? '#71e7e9' : '#dfe6f5', nameText, `font-weight="${r.me ? 800 : 600}"`);
    for (let k = 0; k < 4; k++) {
      const filled = k < r.n;
      s += `<rect x="${px + 112 + k * 19}" y="${ry - 12}" width="14" height="14" rx="3" fill="${filled ? (r.me ? '#71e7e9' : '#d4af37') : '#1e2a42'}" stroke="${filled ? 'none' : '#33415e'}"/>`;
    }
    s += T(px + pw - 16, ry, 14, r.n === top && top > 0 ? '#d4af37' : '#9fb0cf', `${r.n}/4`, 'text-anchor="end" font-weight="700"');
  });
  // 시련 진행
  const by = Math.max(py + panelH + 34, 400);
  s += T(px, by, 13, '#9fb0cf', '시련 진행', 'font-weight="700" letter-spacing="1"');
  const bw = (pw - 18) / 4;
  ORDER.forEach((k, i) => {
    const st = states[k];
    s += `<rect x="${px + i * (bw + 6)}" y="${by + 12}" width="${bw}" height="10" rx="5" fill="${st === 2 ? '#d4af37' : st === 1 ? ZONES[k].color : '#1e2a42'}"/>` +
      T(px + i * (bw + 6) + bw / 2, by + 42, 12, st === 0 ? '#5f6b86' : '#dfe6f5', ZONES[k].boss, 'text-anchor="middle"');
  });
  // 공지
  const ny = 512;
  if (head) {
    s += `<rect x="28" y="${ny}" width="${W - 56}" height="48" rx="12" fill="#1a1608" stroke="#5a4a1c"/>` +
      T(46, ny + 31, 15, '#d4af37', '―[공지]―', 'font-weight="800"') +
      T(136, ny + 31, 16, '#f3e6c0', truncate(head, 16, W - 190), 'font-weight="600"');
  } else {
    s += T(W / 2, ny + 30, 13, '#5f6b86', '네 시련이 끝나면, 한 사람이 별이 된다', 'text-anchor="middle" letter-spacing="1"');
  }
  return frame(H, s, '#0a1120');
}

// ───────────────────────── 안내·오류 ─────────────────────────
function help() {
  const lines = [
    ['/ 목록', 'd=7/6+14:20 & o=카더라주의 & l=!제목~닉;?제목~*닉;제목~닉'],
    ['/ 글', 't=제목 & w=닉 & d=날짜 & s=본문 & c=ㅇㅇ~댓글;↳ㅇㅇ~반박'],
    ['/s 현황판', 'd=날짜 & z=0120(서남동북 0/1/2) & u=중 & k=*이름~1;하준~1 & h=공지'],
    ['공통', '띄어쓰기는 +, 값 안에 & # % ; ~ ( ) 금지']
  ];
  let s = header('성좌게임 SVG 워커 · sg', 'v4');
  let y = 110;
  lines.forEach(([k, v]) => {
    s += T(28, y, 17, '#18213d', k, 'font-weight="800"');
    wrap(v, 15, W - 200, 3).forEach((ln, i) => { s += T(170, y + i * 24, 15, '#3b4252', ln); });
    y += 62;
  });
  return frame(y + 10, s, '#ffffff');
}
function errorCard(err) {
  const msg = clean(err && err.message ? err.message : err, 120);
  return frame(120, header('표시 오류', '') + T(28, 104, 15, '#d8433b', msg || '알 수 없는 오류'), '#ffffff');
}
