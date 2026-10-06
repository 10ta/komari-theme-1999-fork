// Copies src/ to dist/ and stamps local asset URLs in index.html with ?v=<version>,
// so CDNs and browsers fetch fresh files after every release.
import { cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('komari-theme.json', root), 'utf8'));
const dist = new URL('dist/', root);

rmSync(dist, { recursive: true, force: true });
cpSync(new URL('src/', root), dist, { recursive: true });

const indexUrl = new URL('index.html', dist);
const html = readFileSync(indexUrl, 'utf8').replace(
  /(<(?:script|link)\b[^>]*\b(?:src|href)=")(?!https?:|\/\/|data:)([^"?#]+\.(?:js|css))(")/g,
  (_, head, path, tail) => `${head}${path}?v=${version}${tail}`
);
writeFileSync(indexUrl, html);

const css = readFileSync(new URL('styles.css', dist), 'utf8').replace(
  /url\((['"]?)(vendor\/[^'")?#]+)\1\)/g,
  (_, quote, path) => `url(${quote}${path}?v=${version}${quote})`
);
writeFileSync(new URL('styles.css', dist), css);
console.log(`dist/ built for v${version}`);
