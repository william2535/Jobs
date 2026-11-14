import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
// Only public static shell files enter this cache. ignoreVary handles static servers
// with Vary: Origin on module requests; no authenticated/personal responses are cached.
// Build-specific precache: never mark offline-ready until every shell file is cached.
export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "offline-shell",
      generateBundle(_, bundle) {
        const files = [
          "./",
          "./index.html",
          ...readdirSync("public").map((name) => "./" + name),
          ...Object.keys(bundle).map((p) => "./" + p),
        ];
        const version = createHash("sha256")
          .update(
            Object.keys(bundle).join("|") +
              readdirSync("public")
                .sort()
                .map((p) => readFileSync("public/" + p).toString("base64"))
                .join("|"),
          )
          .digest("hex")
          .slice(0, 20);
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: `const CACHE='jobs-v2-${version}'; const FILES=${JSON.stringify(files)};
 self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
 self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('jobs-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
 self.addEventListener('message',e=>{if(e.data?.type==='JOBS_CLAIM_CLIENT'&&e.source?.url&&new URL(e.source.url).origin===self.location.origin)e.waitUntil(self.clients.claim());});
 self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(caches.open(CACHE).then(c=>c.match(e.request,{ignoreVary:true}).then(hit=>hit||fetch(e.request).catch(()=>e.request.mode==='navigate'?c.match('./index.html',{ignoreVary:true}):Response.error()))));});`,
        });
      },
    },
  ],
});
