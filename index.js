// 성좌게임 SVG 워커 sg v3 — 단일 파일, import 없음 (Cloudflare Workers 모듈 문법)
//   / 또는 /f  플레이어넷   목록: ?d=7/6+14:20&o=카더라주의&l=!제목~닉;?제목~*닉;제목~닉
//                         글  : ?t=제목&w=닉&d=7/6+14:20&s=본문&c=ㅇㅇ~댓글;↳ㅇㅇ~반박
//                         같은 제목이면 목록 행과 글 화면의 조회·추천·댓글 수가 같게 나온다
//   /s  공략 현황판       ?d=7/6+14:20&z=0120&u=중&k=*이름~1;하준~1&h=공지
// 응답은 전부 image/svg+xml. 마크다운 ![](URL) 로 그대로 표시된다.

const FONT = "Pretendard,'Apple SD Gothic Neo','Noto Sans KR','Noto Sans CJK KR','Malgun Gothic',sans-serif";
const W = 720;

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
    if (/[A-Z0-9]/.test(ch)) return 0.62;
    return 0.53;
  }
  if (c >= 0x1f000) return 1.15;                       // 이모지
  if (c >= 0x2190 && c <= 0x2bff) return 1.0;          // 기호·화살표
  if (c >= 0x3130 && c <= 0x318f) return 0.92;         // 한글 자모(ㅋㅋ)
  return 0.93;                                         // 한글·한자 등
}
const measure = (s, size) => Array.from(s).reduce((a, ch) => a + charWidth(ch), 0) * size;

function truncate(s, size, max) {
  if (measure(s, size) <= max) return s;
  const chars = Array.from(s);
  let out = '';
  for (const ch of chars) {
    if (measure(out + ch + '…', size) > max) break;
    out += ch;
  }
  return out + '…';
}

// 단어 단위 줄바꿈(긴 단어는 글자 단위), 줄 수 초과 시 말줄임
function wrap(s, size, max, maxLines = 99) {
  const lines = [];
  let line = '';
  const push = () => { lines.push(line); line = ''; };
  for (const word of s.split(' ')) {
    const candidate = line ? line + ' ' + word : word;
    if (measure(candidate, size) <= max) { line = candidate; continue; }
    if (line) push();
    if (measure(word, size) <= max) { line = word; continue; }
    for (const ch of Array.from(word)) {
      if (measure(line + ch, size) > max) push();
      line += ch;
    }
  }
  if (line) push();
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = truncate(kept[maxLines - 1] + '…', size, max);
    return kept;
  }
  return lines.length ? lines : [''];
}

function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; // 비슷한 제목끼리도 고르게
  return h >>> 0;
}
const pick = (seed, min, max) => min + (hash(seed) % (max - min + 1));
const comma = n => n.toLocaleString('en-US');

const T = (x, y, size, fill, text, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${esc(text)}</text>`;

function frame(h, body, bg = '#eef1f6') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" font-family="${FONT}">` +
    `<rect width="${W}" height="${h}" fill="${bg}"/>${body}</svg>`;
}

// 닉: "*고닉" 고닉 / "ㅇㅇ@C+" 등급 지정 / "ㅇㅇ(C+)" 텍스트판 호환 / 미지정이면 등급 자동
// URL에선 +가 공백으로 풀리므로 "@C " 처럼 등급 뒤 공백은 +로 복원한다.
const GRADES = [['F', 6], ['E', 30], ['E+', 14], ['D', 22], ['D+', 12], ['C', 8], ['C+', 4], ['B', 2.5], ['B+', 1], ['A', 0.5]];
function autoGrade(seed) {
  let r = (hash(seed) % 1000) / 10;
  for (const [g, p] of GRADES) { if ((r -= p) < 0) return g; }
  return 'E';
}
function parseNick(raw, seed = '') {
  let s = String(raw ?? '').replace(/^\s+/, '');
  const fixed = s.startsWith('*');
  if (fixed) s = s.slice(1);
  let grade = '';
  let m = s.match(/^(.*?)@\s*(EX|[A-FS])(\+|\s)?\s*$/i);
  if (m) { s = m[1]; grade = m[2].toUpperCase() + (m[3] ? '+' : ''); }
  else if ((m = s.match(/^(.*?)\(\s*(EX|[A-FS])(\+|\s)?\s*\)\s*$/i))) { s = m[1]; grade = m[2].toUpperCase() + (m[3] ? '+' : ''); }
  const name = clean(s, 16) || (fixed ? '고닉' : 'ㅇㅇ');
  if (!grade && !fixed) grade = autoGrade(name + '|' + seed);
  return { name, grade, fixed };
}
// 본문 속 "C 급"(원래 C+급) 복원
const fixPlus = t => t.replace(/(^|[^A-Za-z])(EX|[A-FS]) (?=급)/g, '$1$2+');
function nickSVG(x, y, nick, size = 17) {
  const { name, grade, fixed } = nick;
  let out = '';
  let cx = x;
  if (fixed) {
    out += `<rect x="${cx}" y="${y - size + 2}" width="${size + 2}" height="${size + 2}" rx="4" fill="#2a3a78"/>` +
      T(cx + (size + 2) / 2, y - 1, size - 4, '#fff', '✦', 'text-anchor="middle" font-weight="700"');
    cx += size + 8;
  }
  out += T(cx, y, size, fixed ? '#2a3a78' : '#3b4252', name, 'font-weight="700"');
  cx += measure(name, size) + 6;
  if (grade) {
    const gw = measure(grade, size - 4) + 12;
    out += `<rect x="${cx}" y="${y - size + 3}" width="${gw}" height="${size}" rx="${size / 2}" fill="#e3e8f2"/>` +
      T(cx + gw / 2, y - 1, size - 4, '#56607a', grade, 'text-anchor="middle" font-weight="600"');
    cx += gw;
  }
  return { svg: out, end: cx };
}

function header(title, right) {
  return `<rect width="${W}" height="64" fill="#18213d"/>` +
    `<rect y="64" width="${W}" height="3" fill="#c9a24a"/>` +
    T(28, 41, 24, '#ffffff', '✦', 'font-weight="700"') +
    T(58, 41, 22, '#ffffff', title, 'font-weight="700" letter-spacing="-0.5"') +
    (right ? T(W - 28, 40, 16, '#aeb9d6', right, 'text-anchor="end"') : '');
}

function titleParts(raw) {
  let t = fixPlus(clean(raw, 80)) || '제목 없음';
  let tag = '';
  if (t.startsWith('!')) { tag = '개념'; t = t.slice(1).trim(); }
  else if (t.startsWith('?')) { tag = '질문'; t = t.slice(1).trim(); }
  return { tag, text: t };
}
// 목록 1행의 상위 글과 2~4행 글 화면이 같은 수치를 쓰도록 제목만으로 시드를 잡는다
const titleKey = text => text.replace(/\s+/g, '');
function postStats(text, tag) {
  const seed = '#' + titleKey(text);
  const views = pick(seed + 'v', 180, 12000);
  const recs = tag === '개념' ? pick(seed + 'r', 180, 520) : pick(seed + 'r', 2, 160);
  const down = pick(seed + 'd', 0, Math.max(2, Math.floor(recs / (tag === '개념' ? 8 : 3))));
  const cmts = pick(seed + 'c', 8, tag === '개념' ? 180 : 120);
  return { views, recs, down, cmts };
}
function tagSVG(x, y, tag, size = 15) {
  if (!tag) return { svg: '', w: 0 };
  const color = tag === '개념' ? '#d8433b' : '#2f6fdb';
  const w = measure(tag, size) + 14;
  return {
    svg: `<rect x="${x}" y="${y - size - 1}" width="${w}" height="${size + 8}" rx="5" fill="${color}"/>` +
      T(x + w / 2, y + 1, size, '#fff', tag, 'text-anchor="middle" font-weight="700"'),
    w: w + 8
  };
}

// ───────────────────────── /f 목록 ─────────────────────────
function boardList(q) {
  const date = clean(q.get('d'), 20);
  const notice = clean(q.get('o'), 60);
  const items = String(q.get('l') ?? '').slice(0, 1600).split(';').filter(x => x.trim()).slice(0, 8);
  let y = 67;
  let body = header('플레이어넷', date);
  // 탭
  body += `<rect y="${y}" width="${W}" height="50" fill="#ffffff"/>`;
  ['전체글', '개념글', '공지'].forEach((t, i) => {
    const x = 28 + i * 96;
    body += T(x, y + 32, 17, i === 0 ? '#18213d' : '#8a93a8', t, i === 0 ? 'font-weight="700"' : '');
    if (i === 0) body += `<rect x="${x}" y="${y + 44}" width="${measure(t, 17)}" height="3" fill="#18213d"/>`;
  });
  y += 50;
  body += `<rect y="${y}" width="${W}" height="1" fill="#dfe4ee"/>`;
  if (notice) {
    body += `<rect y="${y + 1}" width="${W}" height="48" fill="#fff6dc"/>` +
      T(28, y + 32, 17, '#8a6512', '📌', '') +
      T(56, y + 32, 17, '#6b4e0d', truncate(notice, 17, W - 90), 'font-weight="600"');
    y += 49;
  }
  if (!items.length) {
    body += `<rect y="${y}" width="${W}" height="90" fill="#fff"/>` + T(W / 2, y + 52, 18, '#8a93a8', '게시글이 없습니다', 'text-anchor="middle"');
    y += 90;
  }
  items.forEach((raw, i) => {
    const cut = raw.lastIndexOf('~');                 // 제목 속 ~ 는 살리고 마지막 ~ 뒤를 닉으로
    const { tag, text } = titleParts(cut >= 0 ? raw.slice(0, cut) : raw);
    const nick = parseNick(cut >= 0 ? raw.slice(cut + 1) : '', 'w|' + titleKey(text));
    const { views, recs, cmts } = postStats(text, tag);
    const rowH = 82;
    body += `<rect y="${y}" width="${W}" height="${rowH}" fill="${i % 2 ? '#fbfcfe' : '#ffffff'}"/>`;
    const tg = tagSVG(28, y + 34, tag);
    body += tg.svg;
    const cmtLabel = `[${cmts}]`;
    const titleMax = W - 56 - tg.w - measure(cmtLabel, 17) - 10;
    const shown = truncate(text, 20, titleMax);
    body += T(28 + tg.w, y + 34, 20, '#18213d', shown, 'font-weight="700"');
    body += T(28 + tg.w + measure(shown, 20) + 8, y + 34, 17, '#d8433b', cmtLabel, 'font-weight="700"');
    const nk = nickSVG(28, y + 64, nick, 15);
    body += nk.svg;
    body += T(nk.end + 12, y + 63, 14, '#8a93a8', `조회 ${comma(views)}  ·  추천 ${recs}`);
    body += `<rect y="${y + rowH - 1}" width="${W}" height="1" fill="#e6eaf2"/>`;
    y += rowH;
  });
  body += T(W / 2, y + 32, 13, '#9aa3b6', '플레이어넷 · 장막 안 플레이어 전용', 'text-anchor="middle" letter-spacing="1"');
  y += 52;
  return frame(y, body);
}

// ───────────────────────── /f 글 ─────────────────────────
function boardPost(q) {
  const { tag, text } = titleParts(q.get('t'));
  const nick = parseNick(q.get('w'), 'w|' + titleKey(text));   // 목록 행과 같은 자동 등급
  const date = clean(q.get('d'), 20);
  const bodyText = fixPlus(clean(q.get('s'), 900));
  const comments = String(q.get('c') ?? '').slice(0, 2000).split(';').filter(x => x.trim()).slice(0, 8);
  const { views, recs: up, down, cmts } = postStats(text, tag);
  const total = Math.max(cmts, comments.length);              // 목록의 [댓글수]와 일치

  let y = 67;
  let out = header('플레이어넷', '전체글');
  out += `<rect y="${y}" width="${W}" height="2000" fill="#ffffff"/>`; // 본문 배경(잘라서 씀)
  y += 22;
  // 제목
  const tg = tagSVG(28, y + 26, tag, 15);
  const tLines = wrap(text, 26, W - 56 - tg.w, 3);
  out += tg.svg;
  tLines.forEach((ln, i) => { out += T(28 + (i === 0 ? tg.w : 0), y + 30 + i * 38, 26, '#18213d', ln, 'font-weight="800" letter-spacing="-0.6"'); });
  y += 30 + (tLines.length - 1) * 38 + 22;
  // 메타
  const nk = nickSVG(28, y + 18, nick, 16);
  out += nk.svg;
  out += T(nk.end + 12, y + 17, 14, '#8a93a8', date ? `⏱ ${date}` : '');
  out += T(W - 28, y + 17, 14, '#8a93a8', `👁 ${comma(views)}   💬 ${total}`, 'text-anchor="end"');
  y += 36;
  out += `<rect x="28" y="${y}" width="${W - 56}" height="1" fill="#e2e7f0"/>`;
  y += 34;
  // 본문
  const bLines = wrap(bodyText || ' ', 20, W - 56, 18);
  bLines.forEach((ln, i) => { out += T(28, y + i * 33, 20, '#2b3142', ln); });
  y += bLines.length * 33 + 14;
  // 추천
  const pillW = 120;
  const cx = W / 2;
  out += `<rect x="${cx - pillW - 8}" y="${y}" width="${pillW}" height="46" rx="23" fill="#fff" stroke="#2f6fdb" stroke-width="2"/>` +
    T(cx - pillW / 2 - 8, y + 30, 18, '#2f6fdb', `👍 ${up}`, 'text-anchor="middle" font-weight="700"') +
    `<rect x="${cx + 8}" y="${y}" width="${pillW}" height="46" rx="23" fill="#fff" stroke="#9aa3b6" stroke-width="2"/>` +
    T(cx + pillW / 2 + 8, y + 30, 18, '#6c7489', `👎 ${down}`, 'text-anchor="middle" font-weight="700"');
  y += 74;
  // 댓글
  out += `<rect y="${y}" width="${W}" height="1" fill="#e2e7f0"/>`;
  out += T(28, y + 36, 17, '#18213d', '댓글', 'font-weight="700"') +
    T(28 + measure('댓글', 17) + 6, y + 36, 17, '#d8433b', String(total), 'font-weight="700"');
  y += 54;
  if (!comments.length) { out += T(28, y + 10, 16, '#9aa3b6', '아직 댓글이 없습니다'); y += 40; }
  comments.forEach(raw => {
    const reply = /^\s*(↳|>|ㄴ)/.test(raw);
    const r = raw.replace(/^\s*(↳|>|ㄴ)\s*/, '');
    const cut = r.indexOf('~');
    const ct = fixPlus(clean(cut >= 0 ? r.slice(cut + 1) : r, 200));
    const cn = parseNick(cut >= 0 ? r.slice(0, cut) : 'ㅇㅇ', ct);
    const indent = reply ? 58 : 28;
    const lines = wrap(ct, 18, W - indent - 28, 4);
    const boxH = 34 + lines.length * 28 + 14;
    if (reply) {
      out += `<rect x="${indent - 14}" y="${y - 8}" width="${W - indent - 14}" height="${boxH}" rx="10" fill="#f3f5fa"/>` +
        T(30, y + 16, 18, '#9aa3b6', '↳');
    }
    const nn = nickSVG(indent, y + 16, cn, 15);
    out += nn.svg;
    lines.forEach((ln, i) => { out += T(indent, y + 46 + i * 28, 18, '#2b3142', ln); });
    y += boxH + (reply ? 8 : 4);
    if (!reply) out += `<rect x="28" y="${y - 6}" width="${W - 56}" height="1" fill="#eef1f6"/>`;
  });
  if (total > comments.length) {                              // 나머지 댓글은 접힌 것처럼
    y += 6;
    out += `<rect x="28" y="${y}" width="${W - 56}" height="44" rx="10" fill="#f3f5fa"/>` +
      T(W / 2, y + 28, 15, '#56607a', `댓글 ${total - comments.length}개 더보기 ▾`, 'text-anchor="middle" font-weight="600"');
    y += 44;
  }
  y += 18;
  out += T(W / 2, y + 16, 13, '#9aa3b6', '플레이어넷 · 장막 안 플레이어 전용', 'text-anchor="middle" letter-spacing="1"');
  y += 40;
  return frame(y, out, '#ffffff');
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
    ['/ 글', 't=제목 & w=ㅇㅇ(등급 자동, ㅇㅇ@C+로 지정) & d=날짜 & s=본문 & c=ㅇㅇ~댓글;↳ㅇㅇ~반박'],
    ['/s 현황판', 'd=날짜 & z=0120(서남동북 0/1/2) & u=중 & k=*이름~1;하준~1 & h=공지'],
    ['공통', '띄어쓰기는 +, 값 안에 & # % ; ~ ( ) 금지']
  ];
  let s = header('성좌게임 SVG 워커 · sg', 'v3');
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
