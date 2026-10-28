/// <reference types="chrome" />
import { Config, HeuristicLevel } from '../../lib/types';
import type { RuleIndexEntry, RuleIndexSection } from '../../rules/rule-index-builder';
import { storageGet, storageRemove, storageSet } from '../mv-compat';
import { parse as tldtsParse } from 'tldts-experimental';
import { initConfig } from '../utils';
import { ACTIVITY_KEY, ActivityEntry, clearActivity, cmpLabel, getActivity, OUTCOME_LABEL, outcomeOf } from './activity';

declare const __ENGINE_VERSION__: string;

const DAY = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 25;
const MAX_RENDERED_RULES = 100;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
    children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    const { class: cls, ...rest } = props;
    if (cls) node.className = cls;
    Object.assign(node, rest);
    node.append(...children);
    return node;
}

let config: Config;
const saveConfig = () => storageSet({ config });
const setConfig =
    <K extends keyof Config>(key: K) =>
    (value: Config[K]) => {
        config[key] = value;
        saveConfig();
    };

// ---------- routing ----------
const VIEWS = ['activity', 'general', 'sites', 'rules', 'advanced'];
function route() {
    const view = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'activity';
    VIEWS.forEach((v) => $(`#view-${v}`).classList.toggle('active', v === view));
    document.querySelectorAll('nav a').forEach((a) => {
        if (a.getAttribute('href') === `#${view}`) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
    });
    if (view === 'rules') renderRuleSections();
}

// ---------- shared controls ----------
function switchControl(checked: boolean, onChange: (v: boolean) => void, label: string) {
    const input = el('input', { type: 'checkbox', checked });
    input.setAttribute('aria-label', label);
    input.addEventListener('change', () => onChange(input.checked));
    return el('label', { class: 'switch' }, [input, el('span', { class: 'track' })]);
}

function settingRow(title: string, desc: string, control: HTMLElement) {
    return el('div', { class: 'row' }, [
        el('div', { class: 'copy' }, [el('div', { class: 'title', textContent: title }), el('div', { class: 'desc', textContent: desc })]),
        el('div', { class: 'control' }, [control]),
    ]);
}

function selectControl<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void, label: string) {
    const select = el('select', { class: 'input' });
    select.setAttribute('aria-label', label);
    options.forEach(([v, text]) => select.append(el('option', { value: v, textContent: text, selected: v === value })));
    select.addEventListener('change', () => onChange(select.value as T));
    return select;
}

// ---------- activity ----------
let activity: ActivityEntry[] = [];
let shown = PAGE_SIZE;

function relativeTime(ts: number): string {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const startOfDay = (ts: number) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
};

function renderStats() {
    const handled = activity.filter((e) => e.action !== 'detected' && e.ok);
    const now = Date.now();
    const today = startOfDay(now);
    $('#stat-total').textContent = handled.length.toLocaleString();
    const first = handled[handled.length - 1];
    $('#stat-since').textContent = first
        ? `since ${new Date(first.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
        : 'nothing yet';
    $('#stat-week').textContent = handled.filter((e) => e.ts >= today - 6 * DAY).length.toLocaleString();
    $('#stat-today').textContent = `${handled.filter((e) => e.ts >= today).length} today`;
    $('#stat-sites').textContent = new Set(handled.map((e) => e.site)).size.toLocaleString();
    $('#stat-failed').textContent = activity.filter((e) => outcomeOf(e) === 'failed').length.toLocaleString();
}

function niceMax(n: number) {
    if (n <= 4) return 4;
    const step = Math.pow(10, Math.floor(Math.log10(n)));
    return Math.ceil(n / step) * step;
}

function renderChart() {
    const chart = $('#chart');
    const tooltip = $('#tooltip');
    const today = startOfDay(Date.now());
    const days = Array.from({ length: 30 }, (_, i) => today - (29 - i) * DAY);
    const counts = days.map((d) => activity.filter((e) => e.action !== 'detected' && e.ok && e.ts >= d && e.ts < d + DAY).length);
    const max = niceMax(Math.max(...counts));
    chart.replaceChildren();
    if (counts.every((c) => c === 0)) {
        chart.append(el('div', { class: 'chart-empty', textContent: 'No banners handled in the last 30 days' }));
    }
    [0.5, 1].forEach((f) => {
        if (counts.every((c) => c === 0)) return;
        const line = el('div', { class: 'gridline' }, [el('span', { textContent: String(Math.round(max * f)) })]);
        line.style.bottom = `${f * 100}%`;
        chart.append(line);
    });
    days.forEach((d, i) => {
        const bar = el('div', { class: 'bar' });
        bar.style.height = `${(counts[i] / max) * 100}%`;
        const col = el('div', { class: 'col' }, [bar]);
        const label = new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        col.setAttribute('aria-label', `${label}: ${counts[i]}`);
        col.addEventListener('mousemove', (ev) => {
            tooltip.replaceChildren(el('strong', { textContent: `${counts[i]} banner${counts[i] === 1 ? '' : 's'}` }), label);
            tooltip.classList.remove('hidden');
            const x = Math.min(ev.clientX + 12, window.innerWidth - tooltip.offsetWidth - 8);
            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${ev.clientY - tooltip.offsetHeight - 12}px`;
        });
        col.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));
        chart.append(col);
    });
    $('#axis-start').textContent = new Date(days[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderActivityTable() {
    const q = $<HTMLInputElement>('#activity-search').value.trim().toLowerCase();
    const rows = q
        ? activity.filter((e) => e.site.includes(q) || cmpLabel(e.cmp).toLowerCase().includes(q) || e.cmp.toLowerCase().includes(q))
        : activity;
    const visible = rows.slice(0, shown);
    $('#activity-rows').replaceChildren(
        ...visible.map((e) => {
            const outcome = outcomeOf(e);
            const time = el('td', { textContent: relativeTime(e.ts), title: new Date(e.ts).toLocaleString(), class: 'muted' });
            const provider = el('td', { textContent: cmpLabel(e.cmp), title: e.cmp });
            return el('tr', {}, [
                time,
                el('td', { class: 'site-cell', textContent: e.site || '—' }),
                provider,
                el('td', {}, [
                    el('span', { class: `badge ${outcome === 'hidden' ? 'hidden-o' : outcome}`, textContent: OUTCOME_LABEL[outcome] }),
                ]),
                el('td', { class: 'num' }, [
                    e.verified
                        ? el('span', { class: 'verified', textContent: '✓', title: 'Consent state verified' })
                        : el('span', { class: 'subtle', textContent: '—' }),
                ]),
            ]);
        }),
    );
    $('#activity-empty').classList.toggle('hidden', rows.length > 0);
    $('#activity-foot').classList.toggle('hidden', rows.length === 0);
    $('#activity-count').textContent = rows.length ? `Showing ${visible.length} of ${rows.length.toLocaleString()}` : '';
    $('#activity-more').classList.toggle('hidden', visible.length >= rows.length);
}

function renderProviders() {
    const byCmp = new Map<string, { n: number; failed: number; last: number }>();
    activity
        .filter((e) => e.action !== 'detected')
        .forEach((e) => {
            const key = cmpLabel(e.cmp);
            const cur = byCmp.get(key) || { n: 0, failed: 0, last: 0 };
            if (e.ok) cur.n++;
            else cur.failed++;
            cur.last = Math.max(cur.last, e.ts);
            byCmp.set(key, cur);
        });
    const sorted = [...byCmp.entries()].sort((a, b) => b[1].n - a[1].n);
    $('#provider-rows').replaceChildren(
        ...sorted.map(([name, s]) =>
            el('tr', {}, [
                el('td', { class: 'site-cell', textContent: name }),
                el('td', { class: 'num', textContent: s.n.toLocaleString() }),
                el('td', { class: `num ${s.failed ? '' : 'subtle'}`, textContent: s.failed.toLocaleString() }),
                el('td', { class: 'num muted', textContent: relativeTime(s.last), title: new Date(s.last).toLocaleString() }),
            ]),
        ),
    );
    $('#provider-empty').classList.toggle('hidden', sorted.length > 0);
}

async function loadActivity() {
    activity = await getActivity();
    renderStats();
    renderChart();
    renderActivityTable();
    renderProviders();
}

// ---------- general ----------
function renderGeneral() {
    const mode = el('div', { class: 'segmented' });
    mode.setAttribute('role', 'radiogroup');
    (
        [
            ['optOut', 'Reject'],
            ['optIn', 'Accept'],
            ['null', 'Ask'],
        ] as const
    ).forEach(([value, text]) => {
        const input = el('input', { type: 'radio', name: 'opt-mode', value, checked: String(config.autoAction ?? null) === value });
        input.addEventListener('change', () => {
            config.autoAction = value === 'null' ? null : value;
            saveConfig();
        });
        mode.append(el('label', {}, [input, el('span', { textContent: text })]));
    });

    $('#general-rows').replaceChildren(
        settingRow(
            'Mode',
            'Reject keeps only necessary cookies. Ask waits for you to click “Reject this banner” in the toolbar popup.',
            mode,
        ),
        settingRow(
            'Unknown banners',
            'What to do with banners no rule recognises. The recommended setting rejects when there is a reject button and clicks OK on notice-only banners.',
            selectControl<HeuristicLevel>(
                [
                    ['off', 'Ignore'],
                    ['reject', 'Reject only'],
                    ['tier1', 'Reject or acknowledge (recommended)'],
                    ['tier2', 'Reject, acknowledge or accept'],
                ],
                config.heuristicMode,
                (v) => {
                    config.heuristicMode = v;
                    if (v !== 'off') config.enableHeuristicDetection = true;
                    saveConfig();
                },
                'Unknown banners',
            ),
        ),
        settingRow(
            'Hide banners while answering',
            'Keeps known banners invisible while they are handled, so they don’t flash on screen.',
            switchControl(config.enablePrehide, setConfig('enablePrehide'), 'Hide banners while answering'),
        ),
        settingRow(
            'Hide banners that can’t be rejected',
            'Some providers have no reject option; their banner is hidden instead. No consent is given.',
            switchControl(config.enableCosmeticRules, setConfig('enableCosmeticRules'), 'Cosmetic rules'),
        ),
        settingRow(
            'Use generated site rules',
            'Rules DuckDuckGo’s crawler generated for individual sites.',
            switchControl(config.enableGeneratedRules, setConfig('enableGeneratedRules'), 'Generated rules'),
        ),
        settingRow(
            'Watch for late banners',
            'Keeps looking for banners that appear after the page has loaded.',
            switchControl(config.enablePopupMutationObserver, setConfig('enablePopupMutationObserver'), 'Watch for late banners'),
        ),
    );
}

// ---------- paused sites ----------
async function renderSites() {
    const sites: string[] = (await storageGet('exceptions')) || [];
    $('#site-rows').replaceChildren(
        ...sites.map((s) => {
            const remove = el('button', { class: 'btn btn-sm btn-ghost', textContent: 'Resume' });
            remove.addEventListener('click', async () => {
                await storageSet({ exceptions: sites.filter((x) => x !== s) });
                renderSites();
            });
            return el('div', { class: 'list-row' }, [el('span', { class: 'site-cell', textContent: s }), remove]);
        }),
    );
    $('#site-rows').classList.toggle('hidden', sites.length === 0);
    $('#sites-empty').classList.toggle('hidden', sites.length > 0);
}

function normalizeDomain(input: string): string {
    let v = input.trim().toLowerCase();
    if (!v) return '';
    try {
        v = new URL(v.includes('://') ? v : `https://${v}`).hostname;
    } catch {
        return '';
    }
    // Exceptions are matched on the registrable domain (see isEnabledForDomain).
    return tldtsParse(v).domain || '';
}

// ---------- rules ----------
const SECTIONS: [RuleIndexSection, string, string][] = [
    ['generic', 'Provider rules', 'Hand-written rules for consent platforms like OneTrust, Didomi and Cookiebot.'],
    ['generated', 'Generated site rules', 'Crawler-generated rules for individual sites.'],
    ['code', 'Code-based rules', 'Complex providers handled in code.'],
];
let ruleIndex: RuleIndexEntry[] | null = null;
let rulesRendered = false;

async function loadRuleIndex() {
    if (!ruleIndex) ruleIndex = await (await fetch(chrome.runtime.getURL('rule-index.json'))).json();
    return ruleIndex!;
}

async function renderRuleSections() {
    if (rulesRendered) return;
    rulesRendered = true;
    const index = await loadRuleIndex();
    const container = $('#rule-sections');
    container.replaceChildren();

    SECTIONS.forEach(([section, title, desc]) => {
        const rules = index.filter((r) => r.section === section);
        const count = el('span', { class: 'muted', style: 'font-size:13px' } as any);
        const search = el('input', { class: 'input', type: 'search', placeholder: 'Search rules' });
        search.style.width = '200px';
        const list = el('div', { class: 'rule-list' });
        const status = el('span');
        const enableAll = el('button', { class: 'btn btn-sm', textContent: 'Enable all' });
        const disableAll = el('button', { class: 'btn btn-sm', textContent: 'Disable all' });

        const disabled = () => new Set(config.disabledCmps || []);
        const updateCount = () => {
            const d = disabled();
            const off = rules.filter((r) => d.has(r.name)).length;
            count.textContent = off ? `${rules.length - off} of ${rules.length} on` : `${rules.length} on`;
        };
        const render = () => {
            const d = disabled();
            const q = search.value.trim().toLowerCase();
            const matches = q
                ? rules.filter((r) => r.name.toLowerCase().includes(q) || r.urlPattern?.toLowerCase().includes(q))
                : rules.filter((r) => d.has(r.name));
            const visible = matches.slice(0, MAX_RENDERED_RULES);
            list.classList.toggle('hidden', visible.length === 0);
            list.replaceChildren(
                ...visible.map((r) =>
                    el('div', { class: 'list-row', title: r.urlPattern || '' }, [
                        el('span', { class: 'mono', textContent: r.name + (r.cosmetic ? '  · hides' : '') }),
                        switchControl(
                            !d.has(r.name),
                            (on) => {
                                const set = disabled();
                                if (on) set.delete(r.name);
                                else set.add(r.name);
                                config.disabledCmps = [...set].sort();
                                saveConfig();
                                updateCount();
                            },
                            `Rule ${r.name}`,
                        ),
                    ]),
                ),
            );
            status.textContent = q
                ? `${matches.length} match${matches.length === 1 ? '' : 'es'}${matches.length > visible.length ? ` · showing ${visible.length}` : ''}`
                : visible.length
                  ? `${visible.length} disabled rule${visible.length === 1 ? '' : 's'} · search to find others`
                  : 'All rules on · search to find one';
        };
        const setAll = (on: boolean) => {
            const set = disabled();
            rules.forEach((r) => (on ? set.delete(r.name) : set.add(r.name)));
            config.disabledCmps = [...set].sort();
            saveConfig();
            updateCount();
            render();
        };
        search.addEventListener('input', render);
        enableAll.addEventListener('click', () => setAll(true));
        disableAll.addEventListener('click', () => setAll(false));
        updateCount();
        render();

        container.append(
            el('div', { class: 'card' }, [
                el('div', { class: 'card-head' }, [
                    el('div', {}, [
                        el('h3', { textContent: title }),
                        el('div', { class: 'muted', style: 'font-size:13px', textContent: desc } as any),
                    ]),
                    count,
                ]),
                el('div', { class: 'card-body', style: 'padding:12px 20px' } as any, [
                    el('div', { class: 'toolbar' }, [search, el('span', { style: 'flex:1' } as any), enableAll, disableAll]),
                ]),
                list,
                el('div', { class: 'card-foot' }, [status]),
            ]),
        );
    });
}

// ---------- advanced ----------
function renderAdvanced() {
    const retries = el('input', { class: 'input', type: 'number', min: '1', max: '100', value: String(config.detectRetries) });
    retries.style.width = '90px';
    retries.addEventListener('change', () => {
        const n = parseInt(retries.value, 10);
        if (n > 0) {
            config.detectRetries = n;
            saveConfig();
        }
    });
    $('#advanced-rows').replaceChildren(
        settingRow(
            'Highlight clicks',
            'Briefly outlines each element the extension clicks. Useful to see what it did.',
            switchControl(config.visualTest, setConfig('visualTest'), 'Highlight clicks'),
        ),
        settingRow('Detection attempts', 'How many times to look for a banner after page load (about one per second).', retries),
    );

    const logs: [keyof Config['logs'], string][] = [
        ['lifecycle', 'Lifecycle'],
        ['rulesteps', 'Rule steps'],
        ['detectionsteps', 'Detection steps'],
        ['waits', 'Wait steps'],
        ['evals', 'Evals'],
        ['errors', 'Errors'],
        ['messages', 'Internal messages'],
    ];
    $('#log-checks').replaceChildren(
        ...logs.map(([key, text]) => {
            const cb = el('input', { type: 'checkbox', class: 'cb', checked: !!config.logs[key] });
            cb.addEventListener('change', () => {
                config.logs = { ...config.logs, [key]: cb.checked };
                saveConfig();
            });
            return el('label', {}, [cb, text]);
        }),
    );
}

// ---------- init ----------
async function init() {
    config = await storageGet('config');
    config.disabledCmps = config.disabledCmps || [];
    const manifest = chrome.runtime.getManifest();
    $('#version').textContent = `v${manifest.version} · engine ${__ENGINE_VERSION__}`;

    renderGeneral();
    renderAdvanced();
    renderSites();
    await loadActivity();

    window.addEventListener('hashchange', route);
    route();

    $('#activity-search').addEventListener('input', () => {
        shown = PAGE_SIZE;
        renderActivityTable();
    });
    $('#activity-more').addEventListener('click', () => {
        shown += PAGE_SIZE;
        renderActivityTable();
    });

    $('#add-site').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = $<HTMLInputElement>('#add-site-input');
        const domain = normalizeDomain(input.value);
        if (!domain) return;
        const sites: string[] = (await storageGet('exceptions')) || [];
        if (!sites.includes(domain)) await storageSet({ exceptions: [...sites, domain].sort() });
        input.value = '';
        renderSites();
    });

    $('#reload-rules').addEventListener('click', async (e) => {
        const btn = e.currentTarget as HTMLButtonElement;
        const [compact, full] = await Promise.all([
            fetch(chrome.runtime.getURL('compact-rules.json')),
            fetch(chrome.runtime.getURL('rules.json')),
        ]);
        await storageSet({ rules: await compact.json(), fullRules: (await full.json()).autoconsent });
        ruleIndex = null;
        rulesRendered = false;
        renderRuleSections();
        btn.textContent = 'Reloaded';
        setTimeout(() => {
            btn.textContent = 'Reload rules';
        }, 1500);
    });

    $('#clear-activity').addEventListener('click', async () => {
        if (!confirm('Delete all activity history?')) return;
        await clearActivity();
    });

    $('#reset').addEventListener('click', async () => {
        if (!confirm('Reset all settings to defaults?')) return;
        await storageRemove('config');
        await initConfig();
        location.reload();
    });

    // Live-update when banners are handled in other tabs.
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[ACTIVITY_KEY]) loadActivity();
        if (area === 'local' && changes.exceptions) renderSites();
    });
}

init();
