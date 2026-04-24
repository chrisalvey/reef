import { db } from '../firebase-config.js';
import {
  collection, query, orderBy, limit, getDocs
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { enabledParams } from './common.js';

// ── API key ───────────────────────────────────────────────────
async function getApiKey() {
  try {
    const mod = await import('../claude-config.js');
    const key = mod.ANTHROPIC_API_KEY;
    if (!key || key === 'your-api-key-here') {
      throw new Error('Open claude-config.js and replace "your-api-key-here" with your Anthropic API key.');
    }
    return key;
  } catch (e) {
    if (e.message.includes('claude-config.js')) throw e;
    throw new Error('Create claude-config.js in the project root with your Anthropic API key. See the README for instructions.');
  }
}

// ── Fetch all recent readings ─────────────────────────────────
async function fetchAllReadings() {
  const params = enabledParams();
  const snap = await getDocs(query(
    collection(db, 'reef_parameters'),
    orderBy('timestamp', 'desc'),
    limit(500)
  ));
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Group by param key, keep the 15 most recent per param
  const grouped = {};
  params.forEach(p => { grouped[p.key] = []; });
  all.forEach(r => {
    if (grouped[r.paramKey] !== undefined && grouped[r.paramKey].length < 15) {
      grouped[r.paramKey].push(r);
    }
  });
  return { params, grouped };
}

// ── Fetch livestock ───────────────────────────────────────────
async function fetchLivestock() {
  const snap = await getDocs(collection(db, 'reef_livestock'));
  return snap.docs.map(d => d.data());
}

// ── Build prompt ──────────────────────────────────────────────
function buildPrompt(params, grouped) {
  const hasData = params.some(p => (grouped[p.key] || []).length > 0);
  if (!hasData) {
    return 'There are no parameter readings logged yet. Please tell the user to log some water parameter readings first before asking for an analysis.';
  }

  const lines = [
    'You are an expert saltwater reef aquarium consultant. Analyze the following water parameter history and provide practical guidance.',
    '',
    'Please structure your response with these sections:',
    '## Current Status',
    'Brief summary of each parameter — normal, borderline, or out of range.',
    '',
    '## Trends & Patterns',
    'Note any rising, falling, or unstable trends. Mention if readings are stable.',
    '',
    '## Possible Causes',
    'For any parameters outside their safe range or trending in the wrong direction, explain likely causes.',
    '',
    '## Recommendations',
    'Specific, actionable steps the reef keeper should take. Prioritize urgent issues.',
    '',
    '---',
    '',
    'Parameter history (most recent reading first):',
    '',
  ];

  params.forEach(p => {
    const readings = grouped[p.key] || [];
    if (!readings.length) {
      lines.push(`**${p.name}** — no readings logged`);
      lines.push('');
      return;
    }
    lines.push(`**${p.name}** — safe range: ${p.min}–${p.max} ${p.unit}`);
    readings.forEach(r => {
      const d = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const note = r.notes ? ` [${r.notes}]` : '';
      lines.push(`  ${dateStr}: ${Number(r.value).toFixed(p.decimals)} ${p.unit}${note}`);
    });
    lines.push('');
  });

  lines.push('Be specific and practical. A reef keeper with intermediate experience will read this.');
  return lines.join('\n');
}

// ── Stream analysis from Claude ───────────────────────────────
// onChunk(text) — called with each streamed text chunk
// onDone()      — called when streaming completes
// onError(msg)  — called if something goes wrong
export async function runAnalysis({ onChunk, onDone, onError }) {
  let key;
  try {
    key = await getApiKey();
  } catch (e) {
    onError(e.message);
    return;
  }

  let params, grouped;
  try {
    ({ params, grouped } = await fetchAllReadings());
  } catch (e) {
    onError('Failed to load parameter data: ' + e.message);
    return;
  }

  const prompt = buildPrompt(params, grouped);

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        max_tokens: 2048,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (e) {
    onError('Network error — check your connection and API key, then try again.');
    return;
  }

  if (!response.ok) {
    let msg = `API error ${response.status}`;
    try {
      const body = await response.json();
      msg = body.error?.message ?? msg;
    } catch {}
    onError(msg);
    return;
  }

  // Parse SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            onChunk(event.delta.text);
          }
        } catch {}
      }
    }
    onDone();
  } catch (e) {
    onError('Stream interrupted: ' + e.message);
  }
}

// ── Minimal markdown → HTML renderer ─────────────────────────
// Handles: ## headings, **bold**, - bullets, blank lines as paragraphs
export function markdownToHtml(text) {
  const lines = text.split('\n');
  const out = [];
  let inList = false;

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3>${escHtml(line.slice(3))}</h3>`);
    } else if (line.startsWith('### ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h4>${escHtml(line.slice(4))}</h4>`);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineHtml(line.slice(2))}</li>`);
    } else if (line === '---' || line === '***') {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<hr>');
    } else if (line === '') {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<br>');
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p>${inlineHtml(line)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

function inlineHtml(text) {
  return escHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
