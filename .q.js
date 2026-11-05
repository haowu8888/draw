return (async function(){
const H={"X-Flow-Request":"1"};
const get=async(p)=>{const r=await fetch(p,{headers:H,credentials:"include"});return r.status+" "+(await r.text());};
const r=JSON.parse((await get("/api/runs/29136c0cafc76a9700cfb2ce")).slice(4));
const out=r.jobs.map(j=>j.name+" "+j.started_at.slice(11,19)+" → "+(j.finished_at||"").slice(11,19));
const j=r.jobs.find(x=>x.name==="image");
const l=await get("/api/jobs/"+j.id+"/logs");
out.push("npm ci cached: "+/Step 5\/\d+ : RUN npm ci[\s\S]{0,80}Using cache/.test(l));
const d=r.jobs.find(x=>x.name==="deploy-prod");
const dl=await get("/api/jobs/"+d.id+"/logs");
out.push((dl.match(/发布 [^\n]*/)||[""])[0]);
return out.join("\n");
})();
