// Personal build entry: upstream background plus a local activity log and the settings page.
import '../background';
import { ContentScriptMessage } from '../../lib/messages';
import { Config } from '../../lib/types';
import { storageGet } from '../mv-compat';
import { recordActivity, siteFromUrl, updateLatest } from './activity';

chrome.runtime.onMessage.addListener((msg: ContentScriptMessage, sender: chrome.runtime.MessageSender) => {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;
    const site = siteFromUrl(sender.tab?.url) || siteFromUrl(sender.url);

    switch (msg.type) {
        case 'optOutResult':
        case 'optInResult':
            recordActivity({
                tabId,
                site,
                cmp: msg.cmp,
                action: msg.type === 'optOutResult' ? 'reject' : 'accept',
                ok: msg.result,
            });
            break;
        case 'autoconsentDone':
            updateLatest(tabId, msg.cmp, { done: true, cosmetic: msg.isCosmetic });
            break;
        case 'selfTestResult':
            if (msg.result) updateLatest(tabId, msg.cmp, { verified: true });
            break;
        case 'popupFound':
            // In "ask" mode nothing happens until the user acts, so log the banner as waiting.
            storageGet('config').then((config: Config | undefined) => {
                if (config && !config.autoAction) {
                    recordActivity({ tabId, site, cmp: msg.cmp, action: 'detected', ok: true });
                }
            });
            break;
    }
});
