/** NFC stickers contain an entry link only. Job data stays in the saved workspace
 * and editable transfer files; opening a link never records or stops time. */
export const PUBLIC_JOBS_URL = 'https://william2535.github.io/Jobs/';
const MAX_LINK_LENGTH = 4096;
const MAX_SITE_ID = 1000;
const MAX_OFFICE_ID = 160;

const failure = (message, name = 'Error') => Object.assign(new Error(message), { name });
function defaultBase() {
  const location = globalThis.location;
  return !location?.href || location.origin === 'https://appassets.androidplatform.net'
    ? PUBLIC_JOBS_URL : location.href;
}
function canonicalBase(value = defaultBase()) {
  let url;
  try { url = new URL(String(value)); } catch { throw failure('Choose a valid Jobs app address for the sticker.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    throw failure('Jobs sticker links need HTTPS. HTTP is supported only for local development.');
  if (url.username || url.password) throw failure('Jobs sticker links cannot contain sign-in details.');
  url.search = ''; url.hash = '';
  if (url.pathname.endsWith('/index.html')) url.pathname = url.pathname.slice(0, -'index.html'.length);
  else if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}
function identifier(value, label, max, { optional = false, office = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || !value || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value))
    throw failure(`${label} must be a saved identifier of at most ${max} characters.`);
  if (office && !/^[A-Za-z0-9_-]+$/.test(value))
    throw failure('Office identifier can contain only letters, numbers, hyphens and underscores.');
  return value;
}
function validateLabel(value) {
  // Labels are displayed by the caller, never embedded in the public sticker.
  if (value !== undefined && (typeof value !== 'string' || value.length > 80 || /[\u0000-\u001f\u007f]/.test(value)))
    throw failure('Use a sticker label of at most 80 characters.');
}

export function buildTapLink({ kind, siteId, officeId, label } = {}, baseUrl) {
  const url = canonicalBase(baseUrl);
  validateLabel(label);
  const params = new URLSearchParams();
  if (kind === 'office') {
    if (siteId != null) throw failure('An office sticker cannot also select a site.');
    const office = identifier(officeId, 'Office identifier', MAX_OFFICE_ID, { optional: true, office: true });
    params.set('jobs-tap', 'office');
    if (office) params.set('office', office);
  } else if (kind === 'site') {
    if (officeId != null) throw failure('A site sticker cannot also select an office.');
    params.set('jobs-tap', 'site');
    params.set('site', identifier(siteId, 'Site identifier', MAX_SITE_ID));
  } else throw failure('Choose an office or site sticker.');
  url.hash = params.toString();
  if (url.href.length > MAX_LINK_LENGTH) throw failure('This sticker link is too long.');
  return url.href;
}

function parameters(value, allowed) {
  const params = new URLSearchParams(value);
  const seen = new Set();
  for (const [key] of params) {
    if (seen.has(key)) throw failure('The sticker repeats a setting. Create a new Jobs sticker link.');
    if (!allowed.includes(key)) throw failure('The sticker contains unsupported settings. Create a new Jobs sticker link.');
    seen.add(key);
  }
  return params;
}

/** Parse a same-app entry point, including links written by the earlier Jobs Tap
 * preview. This function never reads storage, follows redirects, or changes time. */
export function parseTapLink(value, baseUrl) {
  if (typeof value !== 'string' || value.length > MAX_LINK_LENGTH)
    throw failure('This Jobs sticker link is invalid or too long.');
  const base = canonicalBase(baseUrl);
  let url;
  try { url = new URL(value, base); } catch { throw failure('This Jobs sticker link could not be read.'); }
  const query = new URLSearchParams(url.search);
  const hash = new URLSearchParams(url.hash.slice(1));
  const hasQuery = query.has('tap');
  const hasHash = hash.has('jobs-tap') || hash.has('jobs-site');
  if (!hasQuery && !hasHash) return null;
  if (url.username || url.password || url.origin !== base.origin || canonicalBase(url).pathname !== base.pathname)
    throw failure('This sticker belongs to a different app address. Open a Jobs sticker for this app.');
  if (hasQuery && hasHash) throw failure('The sticker has conflicting entry points. Create a new Jobs sticker link.');
  let kind, siteId = null, officeId = null;
  if (hasQuery) {
    if (url.hash) throw failure('The sticker has an unsupported extra entry point.');
    const params = parameters(url.search, ['tap', 'id', 'office']);
    kind = params.get('tap');
    if (kind === 'site') {
      if (params.has('office')) throw failure('A site sticker cannot also select an office.');
      siteId = identifier(params.get('id'), 'Site identifier', MAX_SITE_ID);
    } else if (kind === 'office') {
      if (params.has('id')) throw failure('An office sticker cannot also select a site.');
      officeId = identifier(params.get('office'), 'Office identifier', MAX_OFFICE_ID, { optional: true, office: true });
    }
  } else {
    if (url.search) throw failure('The sticker contains unsupported query settings.');
    const params = parameters(url.hash.slice(1), ['jobs-tap', 'jobs-site', 'site', 'office']);
    if (params.has('jobs-site')) {
      if ([...params.keys()].length !== 1) throw failure('The sticker has conflicting site settings.');
      kind = 'site'; siteId = identifier(params.get('jobs-site'), 'Site identifier', MAX_SITE_ID);
    } else {
      kind = params.get('jobs-tap');
      if (kind === 'site') {
        if (params.has('office')) throw failure('A site sticker cannot also select an office.');
        siteId = identifier(params.get('site'), 'Site identifier', MAX_SITE_ID);
      } else if (kind === 'office') {
        if (params.has('site')) throw failure('An office sticker cannot also select a site.');
        officeId = identifier(params.get('office'), 'Office identifier', MAX_OFFICE_ID, { optional: true, office: true });
      }
    }
  }
  if (!['office', 'site'].includes(kind)) throw failure('This sticker does not select a supported Jobs entry point.');
  return { kind, siteId, officeId, cleanUrl: base.href };
}

/** Called directly from the Write button. Browser NFC support is optional;
 * iPhone can open an NFC URL via the OS but Safari cannot write the sticker. */
export async function writeTapSticker(link, {
  NDEFReader = globalThis.NDEFReader,
  secureContext = globalThis.isSecureContext,
  userActivation = globalThis.navigator?.userActivation,
  baseUrl,
  signal,
} = {}) {
  const target = parseTapLink(link, baseUrl);
  if (!target) throw failure('Create an office or site sticker link before writing.');
  if (signal?.aborted) throw failure('Sticker writing was cancelled. No successful write was confirmed.', 'AbortError');
  if (!secureContext) throw failure('Open Jobs over HTTPS before writing an NFC sticker.', 'SecurityError');
  if (typeof NDEFReader !== 'function')
    throw failure('This browser cannot write NFC stickers. Copy the link into an NFC tag-writing app, or open Quick Transfer directly.', 'NotSupportedError');
  if (userActivation?.isActive === false)
    throw failure('Tap Write NFC sticker to start writing.', 'NotAllowedError');
  const url = buildTapLink(target, baseUrl);
  try {
    await new NDEFReader().write({ records: [{ recordType: 'url', data: url }] }, signal ? { signal } : {});
    if (signal?.aborted) throw failure('Sticker writing was cancelled. No successful write was confirmed.', 'AbortError');
    return { status: 'written', url };
  } catch (cause) {
    if (cause?.name === 'AbortError') throw failure('Sticker writing was cancelled. No successful write was confirmed.', 'AbortError');
    if (cause?.name === 'NotAllowedError') throw failure('NFC permission was not granted. Allow NFC and tap Write NFC sticker again.', 'NotAllowedError');
    if (cause?.name === 'NotSupportedError') throw failure('NFC writing is unavailable on this device. Copy the link into an NFC tag-writing app.', 'NotSupportedError');
    throw failure('The NFC sticker could not be written. Check that NFC is on and the sticker is writable, then try again.', cause?.name || 'Error');
  }
}
