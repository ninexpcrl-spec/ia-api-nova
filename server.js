const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Banco de dados
let brainrots = [];
let jobIds = {};
let blacklist = [];

// Função para formatar valor
function formatarValor(valor) {
    if (valor >= 1e12) return (valor/1e12).toFixed(1) + 'T';
    if (valor >= 1e9) return (valor/1e9).toFixed(1) + 'B';
    if (valor >= 1e6) return (valor/1e6).toFixed(1) + 'M';
    if (valor >= 1e3) return (valor/1e3).toFixed(1) + 'K';
    return valor.toString();
}

// Endpoint principal
app.post('/api/brainrot', (req, res) => {
    console.log("📡 Recebido:", JSON.stringify(req.body));
    
    let data = req.body;
    if (req.body.data) data = req.body.data;
    
    const jobId = data.job_id || data.servidor;
    const status = data.status || (data.nome ? "boa" : "analisando");
    
    if (!jobId) {
        return res.status(400).json({ error: "job_id obrigatorio" });
    }
    
    // Inicializa Job ID
    if (!jobIds[jobId]) {
        jobIds[jobId] = {
            job_id: jobId,
            status: "analisando",
            total_brainrots: 0,
            melhor_valor: 0,
            melhor_brainrot: null,
            players: data.players || 0,
            primeiro: new Date().toISOString(),
            ultimo: new Date().toISOString()
        };
    }
    
    // Se tem brainrot (status boa)
    if (status === "boa" || data.nome) {
        jobIds[jobId].status = "boa";
        jobIds[jobId].total_brainrots = (jobIds[jobId].total_brainrots || 0) + 1;
        jobIds[jobId].ultimo = new Date().toISOString();
        
        if (data.valor_raw && data.valor_raw > (jobIds[jobId].melhor_valor || 0)) {
            jobIds[jobId].melhor_valor = data.valor_raw;
            jobIds[jobId].melhor_brainrot = data.nome;
        }
        
        // Salva brainrot
        if (data.nome) {
            brainrots.push({
                id: brainrots.length + 1,
                nome: data.nome,
                valor: data.valor || formatarValor(data.valor_raw || 0),
                valor_raw: data.valor_raw || 0,
                job_id: jobId,
                recebido: new Date().toISOString()
            });
            console.log(`✅ Brainrot salvo: ${data.nome}`);
        }
        
        // Remove da blacklist se estiver
        const index = blacklist.indexOf(jobId);
        if (index !== -1) blacklist.splice(index, 1);
        
    } else if (status === "ruim") {
        jobIds[jobId].status = "ruim";
        if (!blacklist.includes(jobId)) {
            blacklist.push(jobId);
        }
        console.log(`❌ Job ID ${jobId.substring(0,8)} na BLACKLIST`);
    }
    
    jobIds[jobId].players = data.players || jobIds[jobId].players;
    jobIds[jobId].ultimo = new Date().toISOString();
    
    res.json({
        success: true,
        job_id: jobId,
        status: jobIds[jobId].status,
        is_blacklisted: blacklist.includes(jobId)
    });
});

// Listar todas Job IDs
app.get('/api/jobs', (req, res) => {
    res.json(Object.values(jobIds));
});

// Listar apenas BOAS
app.get('/api/good-jobs', (req, res) => {
    const boas = Object.values(jobIds).filter(job => job.status === "boa");
    res.json(boas);
});

// Listar BLACKLIST
app.get('/api/blacklist', (req, res) => {
    const blacklisted = Object.values(jobIds).filter(job => job.status === "ruim");
    res.json(blacklisted);
});

// Listar Brainrots
app.get('/api/brainrots', (req, res) => {
    res.json(brainrots.slice(-100).reverse());
});

// Remover da blacklist
app.delete('/api/blacklist/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    const index = blacklist.indexOf(jobId);
    if (index !== -1) blacklist.splice(index, 1);
    if (jobIds[jobId]) jobIds[jobId].status = "analisando";
    res.json({ success: true });
});

// Limpar tudo
app.post('/api/clear-all', (req, res) => {
    brainrots = [];
    jobIds = {};
    blacklist = [];
    res.json({ success: true });
});

// Estatísticas
app.get('/api/stats', (req, res) => {
    const boas = Object.values(jobIds).filter(j => j.status === "boa").length;
    const ruins = Object.values(jobIds).filter(j => j.status === "ruim").length;
    const analisando = Object.values(jobIds).filter(j => j.status === "analisando").length;
    const valorTotal = brainrots.reduce((sum, b) => sum + (b.valor_raw || 0), 0);
    
    res.json({
        total_brainrots: brainrots.length,
        total_job_ids: Object.keys(jobIds).length,
        job_ids_boas: boas,
        job_ids_ruins: ruins,
        job_ids_analisando: analisando,
        blacklist_total: blacklist.length,
        valor_total: formatarValor(valorTotal)
    });
});

// Dashboard
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>IA UTILITIES</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
            color: #fff;
            min-height: 100vh;
        }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        h1 { text-align: center; margin-bottom: 10px; font-size: 2.5em; }
        h1 span { color: #ff6b35; }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: rgba(255,255,255,0.1);
            border-radius: 15px;
            padding: 20px;
            text-align: center;
        }
        .stat-card h3 { font-size: 0.8em; opacity: 0.8; margin-bottom: 10px; }
        .stat-card .value { font-size: 1.8em; font-weight: bold; color: #ff6b35; }
        .stat-card .value.good { color: #00ff88; }
        .stat-card .value.bad { color: #ff4444; }
        .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        .tab-btn {
            background: rgba(255,255,255,0.1);
            border: none;
            color: white;
            padding: 10px 20px;
            border-radius: 25px;
            cursor: pointer;
        }
        .tab-btn.active { background: #ff6b35; }
        .action-buttons { display: flex; gap: 10px; margin-bottom: 20px; }
        .btn {
            background: rgba(255,255,255,0.1);
            border: none;
            color: white;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
        }
        .btn-danger { background: rgba(255,68,68,0.3); }
        .table-container {
            background: rgba(255,255,255,0.05);
            border-radius: 15px;
            overflow-x: auto;
        }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1); }
        th { background: rgba(0,0,0,0.3); color: #ff6b35; }
        .badge-good { background: rgba(0,255,136,0.2); color: #00ff88; padding: 4px 10px; border-radius: 20px; display: inline-block; }
        .badge-bad { background: rgba(255,68,68,0.2); color: #ff4444; padding: 4px 10px; border-radius: 20px; display: inline-block; }
        .badge-warning { background: rgba(255,170,0,0.2); color: #ffaa00; padding: 4px 10px; border-radius: 20px; display: inline-block; }
        .delete-btn { background: rgba(255,68,68,0.3); border: none; color: white; padding: 5px 10px; border-radius: 5px; cursor: pointer; }
        .brainrot-card {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 12px 15px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .brainrot-card:hover { background: rgba(255,255,255,0.05); }
        .brainrot-icon { width: 45px; height: 45px; background: linear-gradient(135deg, #a855f7, #d946ef); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; }
        .brainrot-info { flex: 1; }
        .brainrot-name { font-weight: 600; margin-bottom: 5px; }
        .brainrot-value { color: #ff6b35; font-weight: 600; }
        .brainrot-meta { font-size: 0.7rem; color: rgba(255,255,255,0.5); }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        @media (max-width: 768px) { th, td { padding: 8px; font-size: 0.7rem; } .stats-grid { grid-template-columns: repeat(2, 1fr); } }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧠 <span>IA UTILITIES</span></h1>
        <div class="stats-grid" id="stats"></div>
        <div class="action-buttons">
            <button class="btn" onclick="carregarTudo()">🔄 Atualizar</button>
            <button class="btn btn-danger" onclick="limparTudo()">⚠️ Limpar Tudo</button>
        </div>
        <div class="tabs">
            <button class="tab-btn active" onclick="mudarTab('brainrots')">🧠 Brainrots</button>
            <button class="tab-btn" onclick="mudarTab('boas')">✅ BOAS</button>
            <button class="tab-btn" onclick="mudarTab('blacklist')">❌ BLACKLIST</button>
            <button class="tab-btn" onclick="mudarTab('todas')">📊 Todas Jobs</button>
        </div>
        <div id="tab-brainrots" class="tab-content active"><div class="table-container" id="brainrots-list"></div></div>
        <div id="tab-boas" class="tab-content"><div class="table-container"><table><thead><tr><th>Job ID</th><th>Melhor Brainrot</th><th>Valor</th><th>Brainrots</th></tr></thead><tbody id="boas-list"></tbody></table></div></div>
        <div id="tab-blacklist" class="tab-content"><div class="table-container"><table><thead><tr><th>Job ID</th><th>Ações</th></tr></thead><tbody id="blacklist-list"></tbody></table></div></div>
        <div id="tab-todas" class="tab-content"><div class="table-container"><table><thead><tr><th>Job ID</th><th>Status</th><th>Brainrots</th><th>Melhor Valor</th><th>Melhor Brainrot</th></tr></thead><tbody id="todas-list"></tbody></table></div></div>
    </div>
    <script>
        async function carregarStats() {
            const res = await fetch('/api/stats');
            const stats = await res.json();
            document.getElementById('stats').innerHTML = \`
                <div class="stat-card"><h3>🧠 Brainrots</h3><div class="value">\${stats.total_brainrots}</div></div>
                <div class="stat-card"><h3>✅ BOAS</h3><div class="value good">\${stats.job_ids_boas}</div></div>
                <div class="stat-card"><h3>❌ BLACKLIST</h3><div class="value bad">\${stats.blacklist_total}</div></div>
                <div class="stat-card"><h3>💰 Valor Total</h3><div class="value">\${stats.valor_total}</div></div>
            \`;
        }
        async function carregarBrainrots() {
            const res = await fetch('/api/brainrots');
            const data = await res.json();
            document.getElementById('brainrots-list').innerHTML = data.map(b => \`<div class="brainrot-card"><div class="brainrot-icon">🧠</div><div class="brainrot-info"><div class="brainrot-name">\${b.nome}</div><div class="brainrot-value">💰 \${b.valor}</div><div class="brainrot-meta">📡 \${b.job_id?.substring(0,20)}... | 🕒 \${new Date(b.recebido).toLocaleString()}</div></div></div>\`).join('') || '<div style="padding:20px;text-align:center">Nenhum brainrot</div>';
        }
        async function carregarBoas() {
            const res = await fetch('/api/good-jobs');
            const data = await res.json();
            document.getElementById('boas-list').innerHTML = data.map(j => \`<tr><td><code>\${j.job_id?.substring(0,30)}...</code></td><td>\${j.melhor_brainrot || '-'}</td><td style="color:#ff6b35">\${formatarValor(j.melhor_valor)}</td><td>\${j.total_brainrots}</td></tr>\`).join('') || '<tr><td colspan="4">Nenhuma Job ID BOA</td></tr>';
        }
        async function carregarBlacklist() {
            const res = await fetch('/api/blacklist');
            const data = await res.json();
            document.getElementById('blacklist-list').innerHTML = data.map(j => \`<tr><td><code>\${j.job_id?.substring(0,30)}...</code></td><td><button class="delete-btn" onclick="removerBlacklist('\${j.job_id}')">🗑️ Remover</button></td></tr>\`).join('') || '<tr><td colspan="2">Nenhuma Job ID na BLACKLIST</td></tr>';
        }
        async function carregarTodas() {
            const res = await fetch('/api/jobs');
            const data = await res.json();
            document.getElementById('todas-list').innerHTML = data.map(j => { let badge = j.status === 'boa' ? '<span class="badge-good">✅ BOA</span>' : (j.status === 'ruim' ? '<span class="badge-bad">❌ BLACKLIST</span>' : '<span class="badge-warning">⏳ ANALISANDO</span>'); return \`<tr><td><code>\${j.job_id?.substring(0,30)}...</code></td><td>\${badge}</td><td>\${j.total_brainrots || 0}</td><td>\${formatarValor(j.melhor_valor)}</td><td>\${j.melhor_brainrot || '-'}</td></tr>\`; }).join('') || '<tr><td colspan="5">Nenhuma Job ID</td></tr>';
        }
        async function removerBlacklist(jobId) { await fetch(\`/api/blacklist/\${jobId}\`, { method: 'DELETE' }); carregarTudo(); }
        async function limparTudo() { if(confirm('⚠️ APAGAR TODOS OS DADOS?')) { await fetch('/api/clear-all', { method: 'POST' }); carregarTudo(); } }
        function formatarValor(valor) { if (valor >= 1e12) return (valor/1e12).toFixed(1)+'T'; if (valor >= 1e9) return (valor/1e9).toFixed(1)+'B'; if (valor >= 1e6) return (valor/1e6).toFixed(1)+'M'; if (valor >= 1e3) return (valor/1e3).toFixed(1)+'K'; return valor?.toString() || '0'; }
        function mudarTab(tab) {
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            if(tab === 'brainrots') { document.getElementById('tab-brainrots').classList.add('active'); document.querySelector('.tabs button:first-child').classList.add('active'); carregarBrainrots(); }
            else if(tab === 'boas') { document.getElementById('tab-boas').classList.add('active'); document.querySelector('.tabs button:nth-child(2)').classList.add('active'); carregarBoas(); }
            else if(tab === 'blacklist') { document.getElementById('tab-blacklist').classList.add('active'); document.querySelector('.tabs button:nth-child(3)').classList.add('active'); carregarBlacklist(); }
            else if(tab === 'todas') { document.getElementById('tab-todas').classList.add('active'); document.querySelector('.tabs button:nth-child(4)').classList.add('active'); carregarTodas(); }
        }
        async function carregarTudo() { await carregarStats(); const tab = document.querySelector('.tab-content.active').id; if(tab === 'tab-brainrots') carregarBrainrots(); else if(tab === 'tab-boas') carregarBoas(); else if(tab === 'tab-blacklist') carregarBlacklist(); else if(tab === 'tab-todas') carregarTodas(); }
        carregarTudo();
        setInterval(carregarTudo, 10000);
    </script>
</body>
</html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log('🧠 IA UTILITIES API RODANDO');
    console.log('='.repeat(50));
    console.log(`🚀 Porta: ${PORT}`);
    console.log(`📊 Dashboard: https://ia-api-nova.onrender.com`);
    console.log('='.repeat(50));
});
