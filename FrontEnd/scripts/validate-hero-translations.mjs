import { readFile } from 'node:fs/promises';

const locales = ['en', 'fa', 'de'];
const sharedSceneKeys = ['eyebrow', 'title', 'highlight', 'label', 'alt'];
const editorialSceneKeys = [...sharedSceneKeys, 'supportingLead', 'supportingDetail', 'pyramid1', 'pyramid2', 'pyramid3'];
const detailKeys = ['button', 'openLabel', 'closeLabel', 'title', 'label', 'description'];

function assertString(value, key) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Missing Hero translation: ${key}`);
}

for (const locale of locales) {
  const messages = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'));
  const hero = messages.CinematicHero;

  assertString(hero?.scroll, `${locale}.CinematicHero.scroll`);
  for (const key of detailKeys) assertString(hero?.details?.[key], `${locale}.CinematicHero.details.${key}`);
  for (const scene of ['s1', 's2', 's3']) {
    for (const key of editorialSceneKeys) assertString(hero?.[scene]?.[key], `${locale}.CinematicHero.${scene}.${key}`);
  }
  for (const key of sharedSceneKeys) assertString(hero?.s4?.[key], `${locale}.CinematicHero.s4.${key}`);
}

console.log('Cinematic Hero translation contract is valid for EN, FA and DE.');
