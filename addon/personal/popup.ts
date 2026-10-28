/// <reference types="chrome" />
import { BackgroundMessage } from '../../lib/messages';
import { Config } from '../../lib/types';
import { storageGet, storageRemove, storageSet } from '../mv-compat';
import { isEnabledForDomain, setIsEnabledForDomain, showOptOutStatus } from '../utils';
import { cmpLabel, getActivity, OUTCOME_LABEL, outcomeOf, siteFromUrl } from './activity';

const MODE_HINTS: Record<string, string> = {
    optOut: 'Rejects optional cookies. Notices with only “OK” are acknowledged.',
    optIn: 'Accepts all cookies on every banner.',
    null: 'Detects banners and waits for you to choose here.',
};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

function openSettings(hash: string) {
    chrome.tabs.create({ url: chrome.runtime.getURL(`personal/options.html#${hash}`) });
    window.close();
}

function relativeTime(ts: number): string {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
}

async function init() {
    const config: Config = await storageGet('config');
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const url = tab?.url || '';
    const isWeb = /^https?:/.test(url);
    const hostname = isWeb ? new URL(url).hostname : '';
    const site = siteFromUrl(url);

    $('#open-settings').addEventListener('click', () => openSettings('general'));
    $('#open-activity').addEventListener('click', (e) => {
        e.preventDefault();
        openSettings('activity');
    });

    // Site toggle
    const enabled = $<HTMLInputElement>('#enabled');
    const siteState = $('#site-state');
    $('#site').textContent = isWeb ? site : 'This page';
    const renderSiteState = () => {
        if (!isWeb) {
            siteState.textContent = 'Not available on browser pages';
            document.body.classList.add('inactive');
        } else {
            siteState.textContent = enabled.checked ? 'Active on this site' : 'Paused on this site';
            document.body.classList.toggle('inactive', !enabled.checked);
        }
    };
    if (isWeb) {
        enabled.checked = config.enabled && (await isEnabledForDomain(hostname));
        enabled.addEventListener('change', async () => {
            await setIsEnabledForDomain(hostname, enabled.checked);
            renderSiteState();
        });
    } else {
        enabled.disabled = true;
    }
    renderSiteState();

    // Mode
    const hint = $('#mode-hint');
    const radios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="mode"]'));
    const current = String(config.autoAction ?? null);
    radios.forEach((r) => {
        r.checked = r.value === current;
        r.addEventListener('change', async () => {
            config.autoAction = r.value === 'null' ? null : (r.value as Config['autoAction']);
            await storageSet({ config });
            hint.textContent = MODE_HINTS[r.value];
        });
    });
    hint.textContent = MODE_HINTS[current] ?? '';

    // Status for this tab
    const activity = await getActivity();
    const latest = tab?.id !== undefined ? activity.find((e) => e.tabId === tab.id && e.site === site) : undefined;
    if (latest) {
        const outcome = outcomeOf(latest);
        $('#status-detail').textContent = `${cmpLabel(latest.cmp)} · ${relativeTime(latest.ts)}`;
        $('#status-badge').innerHTML = `<span class="badge ${outcome}">${OUTCOME_LABEL[outcome]}</span>`;
    }

    // "Ask" mode: offer to handle a detected banner
    if (tab?.id !== undefined) {
        const tabId = tab.id;
        const detectedKey = `detected${tabId}`;
        const frameId = await storageGet(detectedKey);
        if (typeof frameId === 'number' && !config.autoAction) {
            $('#manual-actions').classList.remove('hidden');
            $('#manual-reject').addEventListener('click', async () => {
                await storageRemove(detectedKey);
                showOptOutStatus(tabId, 'working');
                chrome.tabs.sendMessage(tabId, { type: 'optOut' } as BackgroundMessage, { frameId });
                window.close();
            });
        }
    }

    // Footer
    const handled = activity.filter((e) => e.action !== 'detected' && e.ok).length;
    $('#total').textContent = `${handled.toLocaleString()} banner${handled === 1 ? '' : 's'} handled`;
}

init();
