// Local activity log: every banner the extension handles, kept only in chrome.storage.local.
import { storageGet, storageSet } from '../mv-compat';

export type ActivityAction = 'reject' | 'accept' | 'detected';

export type ActivityEntry = {
    id: string;
    ts: number;
    site: string;
    cmp: string;
    action: ActivityAction;
    ok: boolean;
    done?: boolean;
    cosmetic?: boolean;
    verified?: boolean;
    tabId?: number;
};

export const ACTIVITY_KEY = 'activity';
const MAX_ENTRIES = 2000;
// A done/self-test message belongs to the result recorded for the same tab and CMP shortly before.
const MATCH_WINDOW_MS = 2 * 60 * 1000;

// Serialize read-modify-write cycles: messages from several frames can arrive at once.
let queue: Promise<unknown> = Promise.resolve();

function mutate(fn: (list: ActivityEntry[]) => ActivityEntry[] | null): Promise<unknown> {
    queue = queue
        .then(async () => {
            const list: ActivityEntry[] = (await storageGet(ACTIVITY_KEY)) || [];
            const next = fn(list);
            if (next) {
                await storageSet({ [ACTIVITY_KEY]: next });
            }
        })
        .catch((e) => console.error('activity log', e));
    return queue;
}

export function siteFromUrl(url: string | undefined): string {
    if (!url) return '';
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}

export function recordActivity(entry: Omit<ActivityEntry, 'id' | 'ts'>) {
    return mutate((list) => {
        // The same frame can report twice (retries); keep one entry per tab/site/cmp/outcome burst.
        const dupe = list.find(
            (e) =>
                e.tabId === entry.tabId &&
                e.site === entry.site &&
                e.cmp === entry.cmp &&
                e.action === entry.action &&
                Date.now() - e.ts < 5000,
        );
        if (dupe) {
            Object.assign(dupe, entry, { ok: dupe.ok || entry.ok });
            return list;
        }
        list.unshift({ id: crypto.randomUUID(), ts: Date.now(), ...entry });
        return list.slice(0, MAX_ENTRIES);
    });
}

export function updateLatest(tabId: number, cmp: string, patch: Partial<ActivityEntry>) {
    return mutate((list) => {
        const match = list.find((e) => e.tabId === tabId && e.cmp === cmp && Date.now() - e.ts < MATCH_WINDOW_MS);
        if (!match) return null;
        Object.assign(match, patch);
        return list;
    });
}

export async function getActivity(): Promise<ActivityEntry[]> {
    return (await storageGet(ACTIVITY_KEY)) || [];
}

export async function clearActivity() {
    await mutate(() => []);
}

/** Human label for a CMP name, e.g. HEURISTIC-TIER1 → "Unknown banner". */
export function cmpLabel(cmp: string): string {
    if (cmp.startsWith('HEURISTIC')) return 'Unknown banner';
    if (cmp.startsWith('auto_')) return 'Site rule';
    return cmp;
}

export type Outcome = 'rejected' | 'acknowledged' | 'accepted' | 'hidden' | 'failed' | 'waiting';

export function outcomeOf(e: ActivityEntry): Outcome {
    if (e.action === 'detected') return 'waiting';
    if (!e.ok) return 'failed';
    if (e.cosmetic) return 'hidden';
    if (e.action === 'accept' || e.cmp === 'HEURISTIC-TIER2') return 'accepted';
    if (e.cmp === 'HEURISTIC-TIER1') return 'acknowledged';
    return 'rejected';
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
    rejected: 'Rejected',
    acknowledged: 'Acknowledged',
    accepted: 'Accepted',
    hidden: 'Hidden',
    failed: 'Failed',
    waiting: 'Waiting',
};
