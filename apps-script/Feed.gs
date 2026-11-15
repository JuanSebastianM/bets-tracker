/*
 * Bets Tracker feed: a read-only JSON web app over this spreadsheet.
 * Contract: docs/DATA_CONTRACT.md, sections 2 and 3 (schema 1).
 *
 * WHAT IT DOES
 *   doGet() reads the tabs Apuestas, Sombra, Grok, Decisiones, Pinnacle and Reglas with read-only
 *   calls (getSheetByName, getDataRange, getValues, getSpreadsheetTimeZone), keeps only the
 *   whitelisted columns (found by header text, never by position), scrubs every text cell for money,
 *   checks the final JSON once more and returns it. It never writes to the sheet and never opens the
 *   tabs Bank, Resumen mensual, Por mercado or Por liga.
 *
 * NAMES
 *   This file is pasted into the sheet's existing Apps Script project, which already holds the
 *   Pinnacle odds puller (pinPullCloses and friends). Every global here starts with "btFeed" so
 *   nothing collides. The only unprefixed name is doGet, which a web app requires. Before pasting,
 *   search the project for "function doGet": if another doGet exists, do not paste a second one;
 *   make the existing one return btFeedDoGet(e) for this app's requests instead.
 *
 * INSTALL (once)
 *   1. Open the spreadsheet > Extensiones > Apps Script.
 *   2. Archivo + > Secuencia de comandos, name it "Feed", paste this whole file, save.
 *   3. In the function menu pick btFeedSelfTest and press Ejecutar. No new authorisation should be
 *      needed (see SCOPES). Read the log: rows per tab,
 *      meta.redactions, meta.missingHeaders and the JSON size. missingHeaders should be [].
 *   4. Implementar > Nueva implementación > tipo "Aplicación web".
 *      Ejecutar como: "Yo". Quién tiene acceso: "Cualquier usuario". Implementar.
 *   5. Copy the web app URL (ends in /exec) into src/config.js (FEED_URL) and push.
 *
 * SCOPES
 *   This file deliberately has no scope annotation (the usual "only current doc" one). The project
 *   was already authorised with the spreadsheet scope by the Pinnacle script and its time triggers run
 *   under that authorisation. An annotation here would change the scopes of the whole project and stop
 *   those triggers until someone re-authorised them. This file needs nothing beyond what is already
 *   granted: it reads the active spreadsheet and uses the script cache and lock.
 *
 * CACHE
 *   Responses are cached for 5 minutes (BT_FEED_CACHE_TTL): the app's refresh button can show data up
 *   to 5 minutes old. To force a fresh read, run btFeedClearCache from the editor.
 *
 * KILL SWITCH (if the public URL is abused)
 *   Implementar > Gestionar implementaciones > the deployment > Archivar: the URL stops working at once.
 *   Then Implementar > Nueva implementación (same settings as INSTALL step 4), put the new /exec URL in
 *   src/config.js and push. The installed app keeps showing its cached copy meanwhile.
 *
 * REDEPLOY (after changing this file)
 *   Implementar > Gestionar implementaciones > the existing one > editar (lápiz) >
 *   Versión: "Nueva versión" > Implementar. The /exec URL stays the same. Run btFeedSelfTest first.
 *   Bump BT_FEED_SCHEMA only when the JSON shape changes (the app refuses a newer schema).
 */

var BT_FEED_SCHEMA = 1;
var BT_FEED_HIDDEN = '[oculto]';

/**
 * Whitelist per tab: sheet header -> [feed key, kind]. A header not listed here is never read.
 * kinds: date, time, int, price, units, prob (probability as a fraction), frac (EV / CLV as a
 * fraction), minutes (a count of minutes, no upper bound), text, iso (instant text), stamp (local date-time text).
 */
var BT_FEED_TABS = {
  bets: {
    sheet: 'Apuestas',
    required: 'Partido',
    columns: [
      ['ID', 'id', 'int'], ['Fecha', 'date', 'date'], ['Liga', 'league', 'text'], ['Partido', 'match', 'text'],
      ['Tipo', 'type', 'text'], ['Mercado', 'market', 'text'], ['Pick', 'selection', 'text'], ['Cuota', 'price', 'price'],
      ['Stake (u)', 'stakeU', 'units'], ['Casa', 'book', 'text'], ['Prob. modelo', 'probModel', 'prob'],
      ['Cuota justa', 'fairOdds', 'price'], ['EV', 'ev', 'frac'], ['Confianza', 'confidence', 'text'],
      ['Estado', 'status', 'text'], ['Resultado partido', 'result', 'text'], ['Ganancia (u)', 'profitU', 'units'],
      ['Notas/lección', 'notes', 'text'], ['Cuota cierre', 'closePrice', 'price'], ['CLV', 'clv', 'frac'],
      ['Excepción favoritos', 'favoritesException', 'text'], ['Stake máx. (u)', 'maxStakeU', 'units'],
      ['Prob. blend', 'probBlend', 'prob'], ['Prob. modelo últ. 5', 'probLast5', 'prob'],
      ['Prob. IA Sofascore', 'probAI', 'prob'],
    ],
  },
  shadow: {
    sheet: 'Sombra',
    required: null,
    columns: [
      ['Fecha', 'date', 'date'], ['Liga', 'league', 'text'], ['Partido', 'match', 'text'], ['Mercado', 'market', 'text'],
      ['Selección', 'selection', 'text'], ['Cuota', 'price', 'price'], ['Cuota cierre', 'closePrice', 'price'],
      ['Prob. modelo', 'probModel', 'prob'], ['Prob. blend', 'probBlend', 'prob'], ['EV blend', 'evBlend', 'frac'],
      ['Cuota justa', 'fairOdds', 'price'], ['Motivo de descarte', 'reason', 'text'], ['Estado', 'status', 'text'],
      ['Notas', 'notes', 'text'], ['Prob. IA Sofascore', 'probAI', 'prob'],
    ],
  },
  grok: {
    sheet: 'Grok',
    required: null,
    columns: [
      ['Fecha', 'date', 'date'], ['Hora', 'time', 'time'], ['Liga', 'league', 'text'], ['Partido', 'match', 'text'],
      ['Mercado', 'market', 'text'], ['Selección', 'selection', 'text'], ['Cuota', 'price', 'price'],
      ['Cuota mín. Grok', 'minPrice', 'price'], ['Stake Grok (u)', 'stakeU', 'units'], ['Motivo Grok', 'reason', 'text'],
      ['Nuestro veredicto', 'verdict', 'text'], ['Estado', 'status', 'text'], ['Resultado', 'result', 'text'],
      ['Notas', 'notes', 'text'],
    ],
  },
  decisions: {
    sheet: 'Decisiones',
    required: null,
    columns: [
      ['Fecha', 'date', 'date'], ['Tema', 'topic', 'text'], ['Decisión', 'decision', 'text'],
      ['Motivo y evidencia', 'evidence', 'text'], ['Cómo y cuándo se revisa', 'review', 'text'], ['Estado', 'status', 'text'],
    ],
  },
  pinnacle: {
    sheet: 'Pinnacle',
    required: 'id',
    columns: [
      ['id', 'id', 'text'], ['sport_key', 'sport_key', 'text'], ['league', 'league', 'text'],
      ['kickoff_utc', 'kickoff_utc', 'iso'], ['kickoff_bogota', 'kickoff_bogota', 'stamp'], ['home', 'home', 'text'],
      ['away', 'away', 'text'], ['open_1', 'open_1', 'price'], ['open_x', 'open_x', 'price'], ['open_2', 'open_2', 'price'],
      ['open_read_utc', 'open_read_utc', 'iso'], ['last_1', 'last_1', 'price'], ['last_x', 'last_x', 'price'],
      ['last_2', 'last_2', 'price'], ['last_read_utc', 'last_read_utc', 'iso'],
      ['mins_before_kickoff', 'mins_before_kickoff', 'minutes'], ['api_last_update', 'api_last_update', 'iso'],
    ],
  },
};

/** Tab whose numbered rule lines are published (never rule 1: it states the unit value and the bank). */
var BT_FEED_RULES = { sheet: 'Reglas', header: 'Reglas' };

/** A header with any of these is refused even if someone adds it to the whitelist. */
var BT_FEED_MONEY_HEADER = /COP|bank|\$/i;

/**
 * Money in free text. Order matters: the longer forms first. Each match is replaced by [oculto].
 * A single thousand group on its own ("feed 4.333") is NOT money: prices keep three decimals.
 * Examples of every shape live in tests/fixtures/privacy-money.json.
 */
var BT_FEED_MONEY_PATTERNS = [
  // a dollar sign followed by a number, optional mil/k/millones
  /\$\s*[+\-−]?\d[\d.,]*(?:\s\d{3}(?!\d))*(?:\s*(?:mil(?:lones|lón|lon)?|k|m)\b)?/gi,
  // COP / pesos before a number
  /\b(?:COP|pesos)\s*\$?\s*[+\-−]?\d[\d.,]*(?:\s\d{3}(?!\d))*(?:\s*(?:mil(?:lones|lón|lon)?|k)\b)?/gi,
  // a number (optionally with mil/k/millones) followed by COP or pesos
  /[+\-−]?\d[\d.,]*(?:\s\d{3}(?!\d))*\s*(?:(?:mil(?:lones|lón|lon)?|k|m)\s*)?(?:de\s+)?(?:COP|pesos)\b/gi,
  // any number with two or more thousand groups (no price or stat looks like that)
  /\d{1,3}(?:[.,]\d{3}){2,}(?![\d])/g,
  // Added by the audit (each shape has a case in tests/fixtures/privacy-money.json, auditTexts).
  // Currency words and signs other than COP / pesos / $, before or after the number; a colon or a dot
  // between COP / pesos and the number; thousands written with spaces (also no-break and thin spaces).
  /(?:\b(?:COP|pesos|USD|EUR|GBP)\b|€|£)\s*[:.]?\s*\$?\s*[+\-−]?\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d+)?(?:\s*(?:mil(?:lones|lón|lon)?|k|mm?)(?![A-Za-zÀ-ÿ]))?/gi,
  /[+\-−]?\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d+)?\s*(?:(?:mil(?:lones|lón|lon)?|k|mm?)\s*)?(?:de\s+)?(?:€|£|(?:COP|pesos|euros?|libras?(?:\s+esterlinas)?|d[oó]lares?|USD|EUR|GBP)(?![A-Za-zÀ-ÿ]))/gi,
  // thousands written with spaces and no currency ("7 000 000"; no-break and thin spaces too)
  /\d{1,3}(?:\s\d{3}){2,}(?!\d)/g,
  // a number followed by a dollar sign ("25.000" followed by a dollar sign)
  /[+\-−]?\d[\d.,]*\s*\$/g,
  // millions in words or slang, with or without a currency ("7 millones", "1.2 millones", "7 palos")
  /[+\-−]?\d+(?:[.,]\d+)?\s*(?:millones|millón|millon|mill\.|mm|palos|lucas)(?![A-Za-zÀ-ÿ])/gi,
  // "7M", "6.3M", "6,3 M" (capital M only: lower-case m is minutes or metres)
  /[+\-−]?\d+(?:[.,]\d+)?\s?M(?![A-Za-zÀ-ÿ0-9])/g,
  // "25 mil" without a currency; counts of things ("60 mil caracteres") stay readable
  /[+\-−]?\d+(?:[.,]\d+)?\s*mil(?![A-Za-zÀ-ÿ])(?!\s+(?:caracteres|tokens|filas|partidos|simulaciones|iteraciones|líneas|registros|lecturas|corridas|veces|apuestas|picks|muestras))/gi,
  // a money-sized number shortly after a money word: bank, saldo, freebet, bono, depósito, retiro,
  // unidad, "1u =" ("freebet de 25.000", "1u = 25.000", "unidad de 25k"). Prices such as 1.83 are not
  // money-sized, so "1.71 por unidad de xm" stays readable.
  /(?<=(?:\bbank(?:roll)?|\bbanca\b|\bsaldo|\bfree\s?bets?|\bapuestas? gratis|\bbono|\bdep[oó]sit\w*|\bretir\w*|\bunidad(?:es)?\b|\bgan[éó](?![A-Za-zÀ-ÿ])|\bperd[íió](?![A-Za-zÀ-ÿ])|\bapost[éó](?![A-Za-zÀ-ÿ])|\bapuesta de\b|\bpag[óo](?![A-Za-zÀ-ÿ])|\bcobr[éó](?![A-Za-zÀ-ÿ])|\b1\s?u\s*=|\bu\s*=)[^|;\n\d]{0,25})[+\-−]?(?:\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d+)?|\d{4,}(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*(?:k|mil|M)(?![A-Za-zÀ-ÿ]))/gi,
  // a bare integer of five or more digits ("7000000", "25000"); ids written as "id 12345678" stay
  /(?<![\w.,])(?<!\bid\s?)(?<!\bid:\s?)\d{5,}(?![\w])/gi,
];

/**
 * Plausibility bounds for numeric cells (audit): a value outside them is not a price, a unit amount,
 * a probability or an EV, so it is dropped and counted as a redaction (money typed in a number column).
 */
var BT_FEED_NUMERIC_BOUNDS = { int: 10000, price: 1000, units: 1000, prob: 1, frac: 100 };

/**
 * Leftover money markers searched in the final JSON (a hit means a scrubbing bug). A dollar sign only
 * counts next to a number: text such as "$(TABLE)" in a decision is not money and must stay readable.
 */
var BT_FEED_LEFTOVER = /\bCOP\b|\$\s*[+\-−]?\d|\d\s*\$/;

/**
 * Scrub one text cell. Returns { text, hits }.
 * @param {string} text
 */
function btFeedScrub(text) {
  var out = String(text);
  var hits = 0;
  for (var i = 0; i < BT_FEED_MONEY_PATTERNS.length; i++) {
    var re = BT_FEED_MONEY_PATTERNS[i];
    re.lastIndex = 0;
    out = out.replace(re, function () {
      hits++;
      return BT_FEED_HIDDEN;
    });
  }
  return { text: out, hits: hits };
}

/** Number parsing for cells that arrive as text: "+2.74", "1,91", "−0.50". */
function btFeedNumber(text) {
  var s = String(text).trim().replace(/−/g, '-').replace(/^\+/, '').replace(/\s+/g, '');
  if (s === '') return null;
  if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null;
  var v = Number(s);
  return isFinite(v) ? v : null;
}

/** Default date formatter: Apps Script's Utilities when present, Intl otherwise (Node tests). */
function btFeedFormatDate(date, timeZone, pattern) {
  if (typeof Utilities !== 'undefined' && Utilities.formatDate) return Utilities.formatDate(date, timeZone, pattern);
  var parts = {};
  var fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  fmt.formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
  return pattern
    .replace('yyyy', parts.year).replace('MM', parts.month).replace('dd', parts.day)
    .replace('HH', parts.hour).replace('mm', parts.minute);
}

/** Date serial (days since 1899-12-30) to YYYY-MM-DD. */
function btFeedSerialDate(serial) {
  var ms = Math.round((serial - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}

function btFeedIsDate(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

/**
 * Convert one cell to the feed's value rules. ctx = { timeZone, formatDate, count(hits) }.
 * Returns null for empty cells. Text is scrubbed; numbers are numbers; dates are YYYY-MM-DD.
 */
function btFeedCell(value, kind, ctx) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  var fmt = ctx.formatDate;
  var tz = ctx.timeZone;

  if (kind === 'date') {
    if (btFeedIsDate(value)) return fmt(value, tz, 'yyyy-MM-dd');
    if (typeof value === 'number') return value > 20000 && value < 80000 ? btFeedSerialDate(value) : null;
    var s = String(value).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    return btFeedText(s, ctx);
  }
  if (kind === 'time') {
    if (btFeedIsDate(value)) return fmt(value, tz, 'HH:mm');
    if (typeof value === 'number' && value >= 0 && value < 1) {
      var mins = Math.round(value * 1440);
      return ('0' + Math.floor(mins / 60)).slice(-2) + ':' + ('0' + (mins % 60)).slice(-2);
    }
    var t = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
    if (t) return ('0' + t[1]).slice(-2) + ':' + t[2];
    return btFeedText(value, ctx);
  }
  if (kind === 'iso') {
    if (btFeedIsDate(value)) return value.toISOString().replace(/\.\d{3}Z$/, 'Z');
    return btFeedText(value, ctx);
  }
  if (kind === 'stamp') {
    if (btFeedIsDate(value)) return fmt(value, tz, 'yyyy-MM-dd HH:mm');
    return btFeedText(value, ctx);
  }
  if (kind === 'text') {
    if (btFeedIsDate(value)) return fmt(value, tz, 'yyyy-MM-dd');
    return btFeedText(value, ctx);
  }

  // Numeric kinds: int, price, units, prob, frac.
  if (btFeedIsDate(value)) return null;
  var num;
  var raw = typeof value === 'string' ? value.trim() : null;
  if (typeof value === 'number') num = value;
  else if (typeof value === 'boolean') return null;
  else {
    if (BT_FEED_LEFTOVER.test(raw) || /\bpesos\b/i.test(raw)) {
      ctx.count(1); // money where a number was expected: never pass it on
      return null;
    }
    var pct = /%$/.test(raw);
    num = btFeedNumber(pct ? raw.slice(0, -1) : raw);
    if (num === null) return null;
    if (pct) num = num / 100;
  }
  if (kind === 'prob' && num > 1.5) num = num / 100; // "59.7" written as a number
  var bound = BT_FEED_NUMERIC_BOUNDS[kind];
  if (bound !== undefined && Math.abs(num) > bound) {
    ctx.count(1); // not a price, unit amount, probability or EV: possibly money typed in a number column
    return null;
  }
  if (kind === 'int') return Math.round(num);
  return Math.round(num * 1e6) / 1e6;
}

function btFeedText(value, ctx) {
  var s = String(value).replace(/\s+$/g, '').replace(/^\s+/g, '');
  if (s === '') return null;
  var r = btFeedScrub(s);
  if (r.hits) ctx.count(r.hits);
  return r.text;
}

/**
 * Build one tab: header row lookup by text, whitelist only, row number first.
 * @param {any[][]} values the tab's getValues() (row 1 = headers)
 */
function btFeedTab(def, values, ctx, missing) {
  var header = (values[0] || []).map(function (h) { return String(h == null ? '' : h).trim(); });
  var cols = [];
  def.columns.forEach(function (c) {
    if (BT_FEED_MONEY_HEADER.test(c[0])) throw new Error('Whitelist header refused (money): ' + c[0]);
    var idx = -1;
    var found = 0;
    for (var i = 0; i < header.length; i++) {
      if (header[i] === c[0] && !BT_FEED_MONEY_HEADER.test(header[i])) { if (idx < 0) idx = i; found++; }
    }
    // A whitelisted header that appears twice is ambiguous (a new column named like a listed one could
    // carry anything): neither copy is read and the header is reported as missing.
    if (found > 1) idx = -1;
    if (idx < 0) missing.push(def.sheet + '!' + c[0]);
    cols.push({ key: c[1], kind: c[2], idx: idx });
  });
  var requiredIdx = -1;
  if (def.required) {
    for (var r = 0; r < cols.length; r++) if (def.columns[r][0] === def.required) requiredIdx = cols[r].idx;
  }
  var rows = [];
  for (var n = 1; n < values.length; n++) {
    var src = values[n] || [];
    if (def.required && requiredIdx >= 0 && btFeedBlank(src[requiredIdx])) continue;
    var out = [n + 1];
    var any = false;
    for (var k = 0; k < cols.length; k++) {
      var v = cols[k].idx < 0 ? null : btFeedCell(src[cols[k].idx], cols[k].kind, ctx);
      if (v !== null) any = true;
      out.push(v);
    }
    if (any) rows.push(out);
  }
  return { columns: ['row'].concat(cols.map(function (c) { return c.key; })), rows: rows };
}

function btFeedBlank(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/** Numbered rule lines below the "Reglas" header in column A, without rule 1. */
function btFeedRules(values, ctx, missing) {
  var start = -1;
  for (var i = 0; i < values.length; i++) {
    if (String((values[i] || [])[0] == null ? '' : values[i][0]).trim() === BT_FEED_RULES.header) { start = i + 1; break; }
  }
  if (start < 0) {
    missing.push(BT_FEED_RULES.sheet + '!' + BT_FEED_RULES.header);
    return [];
  }
  var out = [];
  for (var r = start; r < values.length; r++) {
    var line = String((values[r] || [])[0] == null ? '' : values[r][0]).trim();
    var m = line.match(/^(\d+)\s*[.)]/);
    if (!m || Number(m[1]) === 1) continue;
    out.push(btFeedText(line, ctx));
  }
  return out;
}

/**
 * The pure part: plain 2-D arrays in, feed object out. No Apps Script calls.
 * @param {Record<string, any[][] | null>} tabValues values by sheet name (null = tab missing)
 * @param {string} timeZone the spreadsheet time zone
 * @param {Date} now
 * @param {(d: Date, tz: string, pattern: string) => string} [formatDate]
 */
function btFeedBuild(tabValues, timeZone, now, formatDate) {
  var redactions = 0;
  var ctx = { timeZone: timeZone, formatDate: formatDate || btFeedFormatDate, count: function (n) { redactions += n; } };
  var missing = [];
  var tabs = {};
  var rowsMeta = {};
  Object.keys(BT_FEED_TABS).forEach(function (key) {
    var def = BT_FEED_TABS[key];
    var values = tabValues[def.sheet];
    if (!values) {
      missing.push(def.sheet);
      tabs[key] = { columns: ['row'].concat(def.columns.map(function (c) { return c[1]; })), rows: [] };
    } else {
      tabs[key] = btFeedTab(def, values, ctx, missing);
    }
    rowsMeta[key] = tabs[key].rows.length;
  });
  var rulesValues = tabValues[BT_FEED_RULES.sheet];
  if (rulesValues) tabs.rules = btFeedRules(rulesValues, ctx, missing);
  else {
    missing.push(BT_FEED_RULES.sheet);
    tabs.rules = [];
  }
  rowsMeta.rules = tabs.rules.length;

  var feed = {
    schema: BT_FEED_SCHEMA,
    generatedAt: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    timeZone: timeZone,
    meta: { rows: rowsMeta, redactions: 0, missingHeaders: missing },
    tabs: tabs,
  };
  redactions += btFeedSelfCheck(feed);
  feed.meta.redactions = redactions;
  var json = JSON.stringify(feed);
  if (BT_FEED_LEFTOVER.test(json)) throw new Error('Feed self-check failed: money marker left in the JSON');
  return feed;
}

/**
 * Final self-check: any string cell that still holds COP, or a $ next to a number, is replaced whole
 * by [oculto].
 * Returns the number of cells replaced (each one is a scrubbing bug worth looking at).
 */
function btFeedSelfCheck(feed) {
  var fixed = 0;
  Object.keys(feed.tabs).forEach(function (key) {
    var tab = feed.tabs[key];
    if (Array.isArray(tab)) {
      for (var i = 0; i < tab.length; i++) {
        if (typeof tab[i] === 'string' && BT_FEED_LEFTOVER.test(tab[i])) { tab[i] = BT_FEED_HIDDEN; fixed++; }
      }
      return;
    }
    tab.rows.forEach(function (row) {
      for (var j = 0; j < row.length; j++) {
        if (typeof row[j] === 'string' && BT_FEED_LEFTOVER.test(row[j])) { row[j] = BT_FEED_HIDDEN; fixed++; }
      }
    });
  });
  return fixed;
}

/** Reads the used tabs (read-only calls only) and builds the feed. */
function btFeedFromSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = Object.keys(BT_FEED_TABS).map(function (k) { return BT_FEED_TABS[k].sheet; }).concat([BT_FEED_RULES.sheet]);
  var values = {};
  names.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    values[name] = sh ? sh.getDataRange().getValues() : null;
  });
  return btFeedBuild(values, ss.getSpreadsheetTimeZone(), new Date());
}

// ---------------------------------------------------------------- response cache (abuse protection)
// The web app URL is public. Every call runs under the owner's Apps Script quota, so doGet serves the
// JSON from CacheService for BT_FEED_CACHE_TTL seconds and reads the sheet only on a miss. No request
// parameter can bypass the cache. A cache value is limited to 100 KB, so the JSON is stored in chunks
// plus an index entry; a missing chunk is a miss. Keys carry the schema so a new shape never serves an
// old one. Cache or lock failures never break the response: they fall through to a fresh build.

var BT_FEED_CACHE_TTL = 300;
/** Characters per chunk: 30,000 chars stay under 100 KB even at 3 bytes per character. */
var BT_FEED_CACHE_CHUNK = 30000;
/** Above this many chunks the JSON is served but not cached. */
var BT_FEED_CACHE_MAX_CHUNKS = 80;
var BT_FEED_CACHE_PREFIX = 'btFeed:s' + BT_FEED_SCHEMA + ':';
var BT_FEED_LOCK_WAIT_MS = 3000;

function btFeedCacheIndexKey() {
  return BT_FEED_CACHE_PREFIX + 'index';
}

/** Cached JSON string or null (any problem is a miss). @param {any} cache CacheService cache */
function btFeedCacheRead(cache) {
  try {
    var idxRaw = cache.get(btFeedCacheIndexKey());
    if (!idxRaw) return null;
    var idx = JSON.parse(idxRaw);
    if (!idx || typeof idx.n !== 'number' || idx.n < 1) return null;
    var keys = [];
    for (var i = 0; i < idx.n; i++) keys.push(BT_FEED_CACHE_PREFIX + 'c' + i);
    var got = cache.getAll(keys) || {};
    var parts = [];
    for (var j = 0; j < keys.length; j++) {
      if (typeof got[keys[j]] !== 'string') return null;
      parts.push(got[keys[j]]);
    }
    var json = parts.join('');
    return json.length === idx.len ? json : null;
  } catch (err) {
    return null;
  }
}

/** Store a JSON string in chunks; returns true when cached. Never throws. */
function btFeedCacheWrite(cache, json, generatedAt) {
  try {
    var n = Math.ceil(json.length / BT_FEED_CACHE_CHUNK);
    if (n < 1 || n > BT_FEED_CACHE_MAX_CHUNKS) return false;
    var values = {};
    for (var i = 0; i < n; i++) values[BT_FEED_CACHE_PREFIX + 'c' + i] = json.slice(i * BT_FEED_CACHE_CHUNK, (i + 1) * BT_FEED_CACHE_CHUNK);
    cache.putAll(values, BT_FEED_CACHE_TTL);
    // The index goes last: a reader never sees an index whose chunks were not written.
    cache.put(btFeedCacheIndexKey(), JSON.stringify({ n: n, len: json.length, generatedAt: generatedAt }), BT_FEED_CACHE_TTL);
    return true;
  } catch (err) {
    return false;
  }
}

/** Build the feed and its two JSON forms (served now, and as stored for later cache hits). */
function btFeedFresh(build) {
  var feed = build();
  feed.meta.cacheTtlSeconds = BT_FEED_CACHE_TTL;
  feed.meta.cached = true;
  var stored = JSON.stringify(feed);
  feed.meta.cached = false;
  return { served: JSON.stringify(feed), stored: stored, generatedAt: feed.generatedAt };
}

/**
 * The cache/lock wrapper, with its services passed in (Node tests use fakes).
 * @param {{ cache: any, lock: any, build: () => any }} deps cache = CacheService script cache (or null),
 *   lock = LockService script lock (or null), build = () => feed object
 * @returns {string} the JSON to serve
 */
function btFeedServe(deps) {
  var cache = deps.cache;
  var lock = deps.lock;
  if (cache) {
    var hit = btFeedCacheRead(cache);
    if (hit) return hit;
  }
  var locked = false;
  if (lock) {
    try {
      locked = lock.tryLock(BT_FEED_LOCK_WAIT_MS);
    } catch (err) {
      locked = false;
    }
  }
  try {
    // Another call may have filled the cache while this one waited for the lock (or failed to get it).
    if (cache) {
      var again = btFeedCacheRead(cache);
      if (again) return again;
    }
    var fresh = btFeedFresh(deps.build);
    if (cache) btFeedCacheWrite(cache, fresh.stored, fresh.generatedAt);
    return fresh.served;
  } finally {
    if (locked) {
      try {
        lock.releaseLock();
      } catch (err) {
        /* the lock expires on its own */
      }
    }
  }
}

function btFeedScriptCache() {
  try {
    return CacheService.getScriptCache();
  } catch (err) {
    return null;
  }
}

function btFeedScriptLock() {
  try {
    return LockService.getScriptLock();
  } catch (err) {
    return null;
  }
}

/** Web app entry for this feed. Request parameters are ignored on purpose (no cache bypass). */
function btFeedDoGet(e) {
  var body;
  try {
    body = btFeedServe({ cache: btFeedScriptCache(), lock: btFeedScriptLock(), build: btFeedFromSpreadsheet });
  } catch (err) {
    body = JSON.stringify({ schema: BT_FEED_SCHEMA, error: String(err && err.message ? err.message : err) });
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return btFeedDoGet(e);
}

/** Run from the editor to force the next request to read the sheet again. */
function btFeedClearCache() {
  var cache = btFeedScriptCache();
  if (!cache) return;
  var keys = [btFeedCacheIndexKey()];
  for (var i = 0; i < BT_FEED_CACHE_MAX_CHUNKS; i++) keys.push(BT_FEED_CACHE_PREFIX + 'c' + i);
  cache.removeAll(keys);
  Logger.log('feed cache cleared');
}

/** Run from the editor before deploying: logs what the app will receive. */
function btFeedSelfTest() {
  var feed = btFeedFromSpreadsheet();
  var json = JSON.stringify(feed);
  Logger.log('rows: ' + JSON.stringify(feed.meta.rows));
  Logger.log('meta.redactions: ' + feed.meta.redactions);
  Logger.log('meta.missingHeaders: ' + JSON.stringify(feed.meta.missingHeaders));
  Logger.log('JSON size: ' + json.length + ' characters (' + Math.round(json.length / 1024) + ' KB)');
  Logger.log('money marker left: ' + (BT_FEED_LEFTOVER.test(json) ? 'YES (do not deploy)' : 'no'));
}
