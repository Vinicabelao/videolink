const form = document.querySelector("#form");
const input = document.querySelector("#url");
const submit = document.querySelector("#submit");
const statusBox = document.querySelector("#status");
const statusTitle = document.querySelector("#status-title");
const statusText = document.querySelector("#status-text");
const result = document.querySelector("#result");
const download = document.querySelector("#download");
const errorBox = document.querySelector("#error");

function show(el){el.classList.remove("hidden")}
function hide(el){el.classList.add("hidden")}
function error(msg){hide(statusBox);hide(result);errorBox.textContent=msg;show(errorBox)}

form.addEventListener("submit", async e => {
  e.preventDefault();
  hide(errorBox); hide(result); show(statusBox);
  submit.disabled = true; statusTitle.textContent = "Processando vídeo...";
  statusText.textContent = "Buscando e preparando o arquivo MP4.";

  try {
    const r = await fetch("/api/convert", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({url:input.value.trim()})
    });
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || "Não foi possível iniciar.");
    await poll(data.id);
  } catch(err) {
    error(err.message);
  } finally { submit.disabled = false; }
});

async function poll(id){
  for(let i=0;i<180;i++){
    await new Promise(r=>setTimeout(r,1000));
    const r=await fetch(`/api/status/${id}`);
    const data=await r.json();
    if(data.status==="done"){
      hide(statusBox); show(result);
      download.href=data.download;
      return;
    }
    if(data.status==="error") throw new Error(data.message || "Falha na conversão.");
    statusText.textContent = i < 8 ? "Conectando à fonte..." : "Processando e preparando o arquivo...";
  }
  throw new Error("O processamento demorou demais. Tente novamente.");
}
async function loadDownloadCount(){
  try {
    const r = await fetch("/api/stats");
    const data = await r.json();
    document.querySelector("#download-count").textContent = Number(data.downloads || 0).toLocaleString("pt-BR");
  } catch {}
}
loadDownloadCount();
