import { getNativePlatform } from './native-platform.js';

export const safePackName = (prefix, identity, suffix = '.jobs.json') => `${prefix}-${String(identity || 'pack').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 90) || 'pack'}${suffix}`;

/** Prepare before the tap so the actual share call retains the browser's user gesture. */
export function prepareJsonShare(data, name, { host = globalThis, native = getNativePlatform() } = {}) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  return async () => {
    if (native) {
      const result = await native.exportBlob(blob, name, { share: true });
      return { ...result, message: result.status === 'cancelled' ? 'Sharing cancelled. Your pack is still saved here.' : result.status === 'shared' ? 'Share sheet opened. Receipt is still pending.' : 'Copy saved. Open it with Receive job pack on the other phone.' };
    }
    if (host.navigator?.share && host.navigator.canShare?.({ files: [file] })) {
      try {
        await host.navigator.share({ files: [file], title: 'Jobs pack' });
        return { status: 'shared', message: 'Share sheet closed. This does not confirm the other phone received the pack.' };
      } catch (error) {
        if (error.name === 'AbortError') return { status: 'cancelled', message: 'Sharing cancelled. Your pack is still saved here.' };
        throw Error('Sharing could not open. Try again, or save a copy from your browser. ' + (error.message || ''));
      }
    }
    const url = host.URL.createObjectURL(blob), link = host.document.createElement('a');
    link.href = url; link.download = name;
    try { host.document.body.append(link); link.click(); }
    catch (error) { host.URL.revokeObjectURL(url); throw error; }
    finally {
      link.remove();
      host.setTimeout(() => host.URL.revokeObjectURL(url), 60000);
    }
    return { status: 'saved', message: 'Download prepared. Share the file from Files, then use Receive job pack on the other phone.' };
  };
}
