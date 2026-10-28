// Points the built manifest at the personal popup and settings page without editing upstream's manifest.
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2];
const manifest = JSON.parse(readFileSync(path, 'utf8'));
manifest.name = 'Autoconsent (necessary only)';
manifest.description = 'Answers cookie banners with “necessary only”. Built from DuckDuckGo autoconsent.';
manifest.action = { ...manifest.action, default_title: 'Autoconsent', default_popup: 'personal/popup.html' };
manifest.options_ui = { page: 'personal/options.html', open_in_tab: true };
writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
