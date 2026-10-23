const DEFAULT_CONFIG_URL = new URL('./site-config.json', document.baseURI);
const HISTORY_CACHE = new Map();
const state = { players: new Map(), selected: null, visibleCamps: 1, dataRoot: null };
const elements = Object.fromEntries(['status-dot','status-text','camp-count','player-search','player-options','empty-state','player-view','player-name','player-category','current-rating','current-note','estimated-rating','estimate-note','rating-change','change-note','match-count','matches-list','load-more'].map(id => [id, document.getElementById(id)]));

function setStatus(message, failed = false) {
  elements['status-text'].textContent = message;
  elements['status-dot'].classList.toggle('error', failed);
}

function normalizeName(name) { return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase(); }
function parseDate(match) { const date = new Date(match.played_at || ''); return Number.isNaN(date.valueOf()) ? new Date(0) : date; }
function byRecent(a, b) { return parseDate(b).valueOf() - parseDate(a).valueOf() || (b.game_number || 0) - (a.game_number || 0); }
function number(value) { return Number.isInteger(value) ? value.toLocaleString('pt-BR') : '—'; }
function signed(value) { return Number.isInteger(value) ? `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR')}` : '—'; }

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Não foi possível carregar ${url}: HTTP ${response.status}`);
  return response.json();
}

function configureAnalytics(analytics) {
  if (analytics?.provider !== 'cloudflare' || !analytics.token || !analytics.token.trim()) return;
  const script = document.createElement('script');
  script.defer = true;
  script.dataset.cfBeacon = JSON.stringify({ token: analytics.token.trim() });
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  document.head.append(script);
}

function campMatches(camp) {
  const unique = new Map();
  for (const match of [...(camp.document.matches || []), ...(camp.document.all_category_matches || [])]) {
    if (!unique.has(match.match_id)) unique.set(match.match_id, match);
  }
  return [...unique.values()];
}

function addPlayerMatch(player, match) {
  const estimated = match.estimated?.players?.find(candidate => normalizeName(candidate.name) === player.key);
  if (!estimated) return;
  if (match.match_id && player.matchIds.has(match.match_id)) return;
  if (match.match_id) player.matchIds.add(match.match_id);
  const opponent = match.players.find(candidate => normalizeName(candidate.name) !== player.key);
  player.matches.push({ match, estimated, opponent, playerResult: normalizeName(match.winner) === player.key ? 'win' : 'loss' });
  if (estimated.associate_id !== null) player.associateId = estimated.associate_id;
  if (!player.categories.has(match.category)) player.categories.set(match.category, 0);
  player.categories.set(match.category, player.categories.get(match.category) + 1);
}

function indexPlayers(camps) {
  const players = new Map();
  for (const camp of camps) {
    for (const match of campMatches(camp)) {
      for (const estimated of match.estimated?.players || []) {
        const key = normalizeName(estimated.name);
        if (!players.has(key)) players.set(key, { key, name: estimated.name, associateId: estimated.associate_id, rating: camp.document.rating, matches: [], matchIds: new Set(), categories: new Map() });
      }
      const names = new Set((match.estimated?.players || []).map(player => normalizeName(player.name)));
      for (const name of names) addPlayerMatch(players.get(name), match);
    }
  }
  for (const player of players.values()) {
    player.matches.sort((a, b) => byRecent(a.match, b.match));
    delete player.matchIds;
  }
  return players;
}


async function officialRating(player, dataRoot) {
  if (!Number.isInteger(player.associateId)) return null;
  const key = new URL(`ratings/${encodeURIComponent(player.rating)}/${player.associateId}.json`, dataRoot).href;
  if (!HISTORY_CACHE.has(key)) HISTORY_CACHE.set(key, fetchJson(key).catch(() => null));
  const history = await HISTORY_CACHE.get(key);
  if (!history?.matches?.length) return null;
  return history.matches.reduce((latest, item) => !latest || new Date(item.played_at) > new Date(latest.played_at) ? item : latest, null);
}

function textNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function playerCamps(player) {
  const camps = new Map();
  for (const item of player.matches) {
    const id = item.match.event_id;
    if (!camps.has(id)) camps.set(id, { id, latest: parseDate(item.match), matches: [] });
    const camp = camps.get(id);
    if (parseDate(item.match) > camp.latest) camp.latest = parseDate(item.match);
    camp.matches.push(item);
  }
  return [...camps.values()].sort((a, b) => b.latest - a.latest);
}

function renderMatches(player) {
  const camps = playerCamps(player);
  const visible = camps.slice(0, state.visibleCamps);
  const matches = visible.flatMap(camp => camp.matches).sort((a, b) => byRecent(a.match, b.match));
  elements['match-count'].textContent = `${matches.length} ${matches.length === 1 ? 'partida' : 'partidas'} · ${visible.length} ${visible.length === 1 ? 'torneio' : 'torneios'}`;
  elements['matches-list'].replaceChildren();
  for (const item of matches) {
    const { match, estimated, opponent, playerResult } = item;
    const card = document.createElement('article');
    card.className = 'match-card';
    const date = textNode('div', 'match-date', '');
    const dateStrong = textNode('strong', '', new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parseDate(match)));
    date.append(dateStrong, document.createTextNode(match.time || ''));
    const info = document.createElement('div');
    info.className = 'match-info';
    info.append(textNode('div', 'category', `${match.category} · ${match.phase}`));
    const opponents = document.createElement('div');
    opponents.className = 'opponents';
    opponents.append(document.createTextNode(player.name), textNode('span', 'vs', 'vs.'), textNode('span', '', opponent?.name || 'Adversário'));
    info.append(opponents, textNode('div', 'match-meta', `Mesa ${match.table} · Partida ${match.game_number}`));
    const scoreContainer = document.createElement('div');
    scoreContainer.className = 'match-score';
    const playerIndex = match.players.findIndex(candidate => normalizeName(candidate.name) === player.key);
    const scores = playerIndex === 1 ? [...match.score].reverse() : match.score;
    const outcome = playerResult === 'win' ? 'Vitória' : 'Derrota';
    const result = textNode('span', playerResult === 'win' ? 'win' : 'loss', `${playerResult === 'win' ? 'V' : 'D'}  ${scores.map(number).join(' – ')}`);
    result.setAttribute('aria-label', `${outcome}: ${scores.map(number).join(' a ')}`);
    scoreContainer.append(result);
    scoreContainer.append(textNode('div', 'match-rating', `Rating est. ${number(estimated.rating_after)} (${signed(estimated.rating_change)})`));
    card.append(date, info, scoreContainer);
    elements['matches-list'].append(card);
  }
  elements['load-more'].hidden = visible.length >= camps.length;
}

async function selectPlayer(name) {
  const player = state.players.get(normalizeName(name));
  if (!player) {
    state.selected = null;
    elements['player-view'].hidden = true;
    elements['empty-state'].hidden = false;
    return;
  }
  state.selected = player;
  elements['empty-state'].hidden = true;
  elements['player-view'].hidden = false;
  elements['player-name'].textContent = player.name;
  elements['player-category'].textContent = [...player.categories.keys()].join(' · ') || '—';
  const latest = player.matches[0];
  const oldest = player.matches[player.matches.length - 1];
  const official = await officialRating(player, state.dataRoot);
  if (state.selected !== player) return;
  const fallback = oldest?.estimated.rating_before;
  elements['current-rating'].textContent = number(official?.final ?? fallback);
  elements['current-note'].textContent = official ? `Oficial · ${official.event}` : fallback !== undefined ? 'Estimativa inicial · rating oficial indisponível' : 'Sem rating disponível';
  elements['estimated-rating'].textContent = number(latest?.estimated.rating_after);
  elements['estimate-note'].textContent = latest ? `${latest.match.category} · ${latest.match.date}` : 'Sem estimativa disponível';
  const cumulative = player.matches.reduce((sum, item) => sum + item.estimated.rating_change, 0);
  elements['rating-change'].textContent = signed(cumulative);
  elements['change-note'].textContent = `${player.matches.length} partidas consideradas`;
  renderMatches(player);
}

async function initialize() {
  try {
    const config = await fetchJson(DEFAULT_CONFIG_URL);
    configureAnalytics(config.analytics);
    const manifestUrl = new URL(config.manifestUrl || './site-data.json', DEFAULT_CONFIG_URL);
    const manifest = await fetchJson(manifestUrl);
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.estimates) || manifest.estimates.length === 0) throw new Error('O manifesto de dados precisa ter schemaVersion 1 e uma lista estimates com ao menos um arquivo.');
    const camps = await Promise.all(manifest.estimates.map(async path => {
      const url = new URL(path, manifestUrl);
      const document = await fetchJson(url);
      if (!Array.isArray(document.matches) || !document.rating) throw new Error(`Arquivo de estimativas inválido: ${url}`);
      return { document, url };
    }));
    camps.sort((a, b) => (b.document.event_id || 0) - (a.document.event_id || 0));
    state.players = indexPlayers(camps);
    const names = [...state.players.values()].map(player => player.name).sort((a, b) => a.localeCompare(b));
    state.dataRoot = new URL('../', camps[0].url);
    elements['player-options'].replaceChildren(...names.map(name => { const option = document.createElement('option'); option.value = name; return option; }));
    elements['player-search'].disabled = false;
    elements['camp-count'].textContent = `${camps.length} ${camps.length === 1 ? 'torneio carregado' : 'torneios carregados'}`;
    setStatus(`${names.length.toLocaleString('pt-BR')} atletas · ${camps.length} ${camps.length === 1 ? 'torneio' : 'torneios'}`);
    elements['player-search'].addEventListener('change', event => selectPlayer(event.target.value));
    elements['player-search'].addEventListener('input', event => {
      const player = state.players.get(normalizeName(event.target.value));
      if (player) selectPlayer(player.name);
      else if (!event.target.value) selectPlayer('');
    });
    elements['load-more'].addEventListener('click', () => {
      state.visibleCamps += 1;
      renderMatches(state.selected);
      elements['load-more'].textContent = 'Carregar torneios anteriores ↓';
    });
  } catch (error) {
    console.error(error);
    setStatus(`Não foi possível carregar os dados: ${error.message}`, true);
    elements['empty-state'].querySelector('p').textContent = 'Confira as configurações do site e o manifesto de dados e tente novamente.';
  }
}

initialize();
