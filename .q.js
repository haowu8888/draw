return (async function(){
const H={"X-Flow-Request":"1"};
const get=async(p)=>{const r=await fetch(p,{headers:H,credentials:"include"});return r.status+" "+(await r.text());};
const r=JSON.parse((await get("/api/runs/ec44c3449c1ab34ff66f13dd")).slice(4));
const run=r.run||r; const jobs=r.jobs||[];
return run.status+" | "+jobs.map(j=>j.name+":"+j.status).join(", ");
})();
