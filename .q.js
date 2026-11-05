return (async function(){
const H={"X-Flow-Request":"1"};
const get=async(p)=>{const r=await fetch(p,{headers:H,credentials:"include"});return r.status+" "+(await r.text());};
const r=JSON.parse((await get("/api/runs/0689476f6f7f3402e3094035")).slice(4));
const run=r.run||r; const jobs=r.jobs||[];
return run.status+" | "+jobs.map(j=>j.name+":"+j.status).join(", ");
})();
