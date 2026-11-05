return (function(){
const errs=[];
const oe=console.error; console.error=(...a)=>{errs.push(a.map(x=>x&&x.stack?x.stack:String(x)).join(" ").slice(0,800)); oe(...a);};
return new Promise(async (res)=>{
  try { const ids = await window.draw.add({ type: "mermaid", code: "flowchart LR\n A-->B", x: 0, y: 0 }); res("OK "+JSON.stringify(ids)); }
  catch(e){ res("ERR "+(e && e.stack ? e.stack : String(e)).slice(0,1500)+"\nconsole:"+errs.join("\n")); }
});
})();
