import {test,expect} from "@playwright/test";
test.use({storageState:{cookies:[],origins:[]}});
test("new users receive three example jobs and reload does not duplicate them",async({page})=>{
 await page.goto("/");
 await expect(page.getByText("EXAMPLE — Fire alarm maintenance",{exact:false}).first()).toBeVisible();
 await expect(page.getByText("EXAMPLE — CCTV maintenance",{exact:false}).first()).toBeVisible();
 await expect(page.getByText("EXAMPLE — Staff door remedial",{exact:false}).first()).toBeVisible();
 await page.reload();
 await expect(page.getByText("EXAMPLE — Fire alarm maintenance",{exact:false}).first()).toBeVisible();
 const counts=await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open("jobs-local");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return new Promise((resolve,reject)=>{const t=db.transaction(["sites","jobs"],"readonly"),s=t.objectStore("sites").count(),j=t.objectStore("jobs").count();t.oncomplete=()=>{db.close();resolve([s.result,j.result])};t.onerror=()=>reject(t.error)})});
 expect(counts).toEqual([1,3]);
});
