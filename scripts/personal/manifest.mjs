// Brands the built manifest as AutoConsent without editing upstream's manifest.
import { readFileSync, writeFileSync } from 'node:fs';

const [path, version] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(path, 'utf8'));
const icons = {
    16: 'personal/brand/icon-16.png',
    32: 'personal/brand/icon-32.png',
    48: 'personal/brand/icon-48.png',
    128: 'personal/brand/icon-128.png',
};
manifest.name = 'AutoConsent';
manifest.description = 'Rejects cookie banners for you, keeping only necessary cookies. Built on DuckDuckGo’s autoconsent engine.';
manifest.version = version;
manifest.version_name = `${version} beta`;
manifest.icons = icons;
manifest.action = { ...manifest.action, default_title: 'AutoConsent', default_popup: 'personal/popup.html', default_icon: icons };
manifest.options_ui = { page: 'personal/options.html', open_in_tab: true };
delete manifest.action.browser_style; // Firefox-only key; Chrome warns about it
writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
