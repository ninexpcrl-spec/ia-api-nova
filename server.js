const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ================================================================
// BANCO DE DADOS
// ================================================================
let brainrots = [];
let jobIds = {};
let blacklist = [];

// ================================================================
// FUNÇÕES
// ================================================================
function formatarValor(valor) {
    if (valor >= 1e12) return (valor/1e12).toFixed(1) + 'T';
    if (valor >= 1e9) return (valor/1e9).toFixed(1) + 'B';
    if (valor >= 1e6) return (valor/1e6).toFixed(1) + 'M';
    if (valor >= 1e3) return (valor/1e3).toFixed(1) + 'K';
    return valor.toString();
}

// ================================================================
// ENDPOINTS
// ================================================================

// Receber dados do Roblox (brainrots e job IDs)
app.post('/api/brainrot', (req, res) => {
    console.log("📡 Requisição recebida:", req.body);
    
    let data = req.body;
    if (req.body.data) data = req.body.data;
    
    const jobId = data.job_id || data.servidor;
    const status = data.status || (data.nome ? "boa" : "desconhecido");
    const players = data.players || 0;
    
    if (!jobId) {
        return res.status(400).json({ error: "job_id é obrigatório" });
    }
    
    // ================================================================
    // TRATAMENTO DE JOB ID COM STATUS
    // ================================================================
    
    // Inicializa Job ID se não existir
    if (!jobIds[jobId]) {
        jobIds[jobId] = {
            job_id: jobId,
            status: status,
            primeiro_registro: new Date().toISOString(),
            ultimo_acesso: new Date().toISOString(),
            total_brainrots: 0,
            melhor_valor: 0,
            melhor_brainrot: null,
            players: players
        };
    }
    
    // ATUALIZA STATUS da Job ID
    if (status === "boa" || (data.nome && !status)) {
        // Se tem brainrot, marca como BOA
        jobIds[jobId].status = "boa";
        jobIds[jobId].total_brainrots = (jobIds[jobId].total_brainrots || 0) + 1;
        
        if (data.valor_raw && data.valor_raw > (jobIds[jobId].melhor_valor || 0)) {
            jobIds[jobId].melhor_valor = data.valor_raw;
            jobIds[jobId].melhor_brainrot = data.nome;
        }
        
        console.log(`✅ Job ID ${jobId.substring(0,8)}... marcada como BOA`);
        
    } else if (status === "ruim" || status === "gameended") {
        // Sem brainrot, marca como RUIM e vai para blacklist
        jobIds[jobId].status = "ruim";
        
        // Adiciona à blacklist se não estiver
        if (!blacklist.includes(jobId)) {
            blacklist.push(jobId);
            console.log(`❌ Job ID ${jobId.substring(0,8)}... enviada para BLACKLIST (sem brainrot)`);
        }
        
    } else if (status === "blacklist") {
        // Forçar blacklist
        if (!blacklist.includes(jobId)) {
            blacklist.push(jobId);
        }
        jobIds[jobId].status = "blacklist";
        console.log(`⚠️ Job ID ${jobId.substring(0,8)}... FORÇADA para BLACKLIST`);
        
    } else {
        // Status padrão (analisando)
        jobIds[jobId].status = "analisando";
        console.log(`⏳ Job ID ${jobId.substring(0,8)}... em análise`);
    }
    
    jobIds[jobId].ultimo_acesso = new Date().toISOString();
    jobIds[jobId].players = players;
    
    // ================================================================
    // SALVA BRAINROT (se tiver)
    // ================================================================
    if (data.nome) {
        const brainrot = {
            id: brainrots.length + 1,
            nome: data.nome,
            valor: data.valor || formatarValor(data.valor_raw || 0),
            valor_raw: data.valor_raw || 0,
            mutacao: data.mutacao,
            traits: data.traits,
            dono: data.dono,
            job_id: jobId,
            status: status,
            players: players,
            timestamp: data.timestamp || Date.now(),
            recebido_em: new Date().toISOString()
        };
        
        brainrots.push(brainrot);
        console.log(`🧠 Brainrot salvo: ${data.nome} - ${brainrot.valor}`);
    }
    
    res.json({
        success: true,
        job_id: jobId,
        status: jobIds[jobId].status,
        is_blacklisted: blacklist.includes(jobId),
        total_brainrots: jobIds[jobId].total_brainrots || 0
    });
});

// ================================================================
// LISTAR JOB IDs (todas)
// ================================================================
app.get('/api/jobs', (req, res) => {
    const lista = Object.values(jobIds);
    res.json(lista);
});

// ================================================================
// LISTAR APENAS JOB IDs BOAS (para revisitar)
// ================================================================
app.get('/api/good-jobs', (req, res) => {
    const boas = Object.values(jobIds).filter(job => job.status === "boa");
    res.json(boas);
});

// ================================================================
// LISTAR BLACKLIST
// ================================================================
app.get('/api/blacklist', (req, res) => {
    const blacklisted = Object.values(jobIds).filter(job => 
        job.status === "ruim" || job.status === "blacklist" || blacklist.includes(job.job_id)
    );
    res.json(blacklisted);
});

// ================================================================
// LISTAR BRAINROTS
// ================================================================
app.get('/api/brainrots', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const brainrotsList = [...brainrots].reverse().slice(0, limit);
    res.json(brainrotsList);
});

// ================================================================
// ADICIONAR JOB ID À BLACKLIST (endpoint separado)
// ================================================================
app.post('/api/blacklist', (req, res) => {
    const { job_id } = req.body;
    
    if (!job_id) {
        return res.status(400).json({ error: "job_id é obrigatório" });
    }
    
    if (!blacklist.includes(job_id)) {
        blacklist.push(job_id);
    }
    
    if (jobIds[job_id]) {
        jobIds[job_id].status = "blacklist";
    }
    
    console.log(`⚠️ Job ID ${job_id.substring(0,8)}... adicionada à blacklist via endpoint`);
    
    res.json({
        success: true,
        job_id: job_id,
        blacklist: blacklist
    });
});

// ================================================================
// REMOVER JOB ID DA BLACKLIST
// ================================================================
app.delete('/api/blacklist/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    const index = blacklist.indexOf(jobId);
    if (index !== -1) {
        blacklist.splice(index, 1);
    }
    if (jobIds[jobId]) {
        jobIds[jobId].status = "analisando";
    }
    res.json({ success: true });
});

// ================================================================
// ESTATÍSTICAS
// ================================================================
app.get('/api/stats', (req, res) => {
    const totalJobs = Object.keys(jobIds).length;
    const boasJobs = Object.values(jobIds).filter(j => j.status === "boa").length;
    const ruinsJobs = Object.values(jobIds).filter(j => j.status === "ruim" || j.status === "blacklist").length;
    const analisandoJobs = Object.values(jobIds).filter(j => j.status === "analisando").length;
    
    const valorTotal = brainrots.reduce((sum, b) => sum + (b.valor_raw || 0), 0);
    const maiorValor = brainrots.length > 0 ? Math.max(...brainrots.map(b => b.valor_raw || 0)) : 0;
    
    res.json({
        total_brainrots: brainrots.length,
        total_job_ids: totalJobs,
        job_ids_boas: boasJobs,
        job_ids_ruins: ruinsJobs,
        job_ids_analisando: analisandoJobs,
        blacklist_total: blacklist.length,
        valor_total: formatarValor(valorTotal),
        maior_valor: formatarValor(maiorValor),
        ultimo_brainrot: brainrots[brainrots.length - 1] || null
    });
});

// ================================================================
// DASHBOARD HTML COMPLETO
// ================================================================
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>IA UTILITIES - Brainrot Manager</title>
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
        .subtitle { text-align: center; margin-bottom: 30px; opacity: 0.8; }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: rgba(255,255,255,0.1);
            border-radius: 15px;
            padding: 15px;
            text-align: center;
            backdrop-filter: blur(10px);
        }
        .stat-card h3 { font-size: 0.8em; opacity: 0.8; margin-bottom: 8px; }
        .stat-card .value { font-size: 1.5em; font-weight: bold; color: #ff6b35; }
        .stat-card .value.good { color: #00ff88; }
        .stat-card .value.bad { color: #ff4444; }
        .stat-card .value.warning { color: #ffaa00; }
        
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
            transition: all 0.3s;
        }
        .tab-btn:hover { background: rgba(255,255,255,0.2); }
        .tab-btn.active { background: #ff6b35; }
        
        .action-buttons {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        .btn {
            background: rgba(255,255,255,0.1);
            border: none;
            color: white;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
        }
        .btn-danger { background: rgba(255,68,68,0.3); }
        .btn-success { background: rgba(0,255,136,0.3); }
        
        .table-container {
            background: rgba(255,255,255,0.05);
            border-radius: 15px;
            overflow-x: auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        th { background: rgba(0,0,0,0.3); color: #ff6b35; }
        
        .badge-good { background: rgba(0,255,136,0.2); color: #00ff88; padding: 4px 10px; border-radius: 20px; font-size: 0.8em; }
        .badge-bad { background: rgba(255,68,68,0.2); color: #ff4444; padding: 4px 10px; border-radius: 20px; font-size: 0.8em; }
        .badge-warning { background: rgba(255,170,0,0.2); color: #ffaa00; padding: 4px 10px; border-radius: 20px; font-size: 0.8em; }
        
        .delete-btn {
            background: rgba(255,68,68,0.3);
            border: none;
            color: white;
            padding: 5px 10px;
            border-radius: 5px;
            cursor: pointer;
        }
        
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        
        @media (max-width: 768px) {
            th, td { padding: 8px; font-size: 0.8em; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧠 <span>IA UTILITIES</span> - Brainrot Manager</h1>
        <div class="subtitle">Blacklist automática para Job IDs sem brainrot</div>
        
        <div class="stats-grid" id="stats"></div>
        
        <div class="action-buttons">
            <button class="btn" onclick="carregarTudo()">🔄 Atualizar</button>
        </div>
        
        <div class="tabs">
            <button class="tab-btn active" onclick="mudarTab('jobs')">📊 Todas Jobs</button>
            <button class="tab-btn" onclick="mudarTab('boas')">✅ Job IDs BOAS</button>
            <button class="tab-btn" onclick="mudarTab('blacklist')">❌ BLACKLIST</button>
            <button class="tab-btn" onclick="mudarTab('brainrots')">🧠 Brainrots</button>
        </div>
        
        <div id="tab-jobs" class="tab-content active">
            <div class="table-container">
                <table>
                    <thead><tr><th>Job ID</th><th>Status</th><th>Brainrots</th><th>Melhor Valor</th><th>Melhor Brainrot</th><th>Players</th></tr></thead>
                    <tbody id="jobs-list"></tbody>
                </table>
            </div>
        </div>
        
        <div id="tab-boas" class="tab-content">
            <div class="table-container">
                <table>
                    <thead><tr><th>Job ID</th><th>Brainrots</th><th>Melhor Valor</th><th>Melhor Brainrot</th></tr></thead>
                    <tbody id="boas-list"></tbody>
                </table>
            </div>
        </div>
        
        <div id="tab-blacklist" class="tab-content">
            <div class="table-container">
                <table>
                    <thead><tr><th>Job ID</th><th>Status</th><th>Motivo</th><th>Ações</th></tr></thead>
                    <tbody id="blacklist-list"></tbody>
                </table>
            </div>
        </div>
        
        <div id="tab-brainrots" class="tab-content">
            <div class="table-container">
                <table>
                    <thead><tr><th>Nome</th><th>Valor</th><th>Job ID</th><th>Data</th></tr></thead>
                    <tbody id="brainrots-list"></tbody>
                </table>
            </div>
        </div>
    </div>
    
    <script>
        async function carregarStats() {
            const res = await fetch('/api/stats');
            const stats = await res.json();
            document.getElementById('stats').innerHTML = \`
                <div class="stat-card"><h3>🧠 Brainrots</h3><div class="value">\${stats.total_brainrots}</div></div>
                <div class="stat-card"><h3>✅ Job IDs BOAS</h3><div class="value good">\${stats.job_ids_boas}</div></div>
                <div class="stat-card"><h3>❌ BLACKLIST</h3><div class="value bad">\${stats.blacklist_total}</div></div>
                <div class="stat-card"><h3>⏳ Analisando</h3><div class="value warning">\${stats.job_ids_analisando}</div></div>
                <div class="stat-card"><h3>💰 Valor Total</h3><div class="value">\${stats.valor_total}</div></div>
            \`;
        }
        
        async function carregarJobs() {
            const res = await fetch('/api/jobs');
            const jobs = await res.json();
            const html = jobs.map(job => {
                let badge = '';
                if (job.status === 'boa') badge = '<span class="badge-good">✅ BOA</span>';
                else if (job.status === 'ruim' || job.status === 'blacklist') badge = '<span class="badge-bad">❌ BLACKLIST</span>';
                else badge = '<span class="badge-warning">⏳ ANALISANDO</span>';
                
                return \`
                    <tr>
                        <td><code>\${job.job_id?.substring(0, 30)}...</code></td>
                        <td>\${badge}</td>
                        <td>\${job.total_brainrots || 0}</td>
                        <td>\${job.melhor_valor ? formatarValor(job.melhor_valor) : '-'}</td>
                        <td>\${job.melhor_brainrot || '-'}</td>
                        <td>\${job.players || '-'}</td>
                    </tr>
                \`;
            }).join('');
            document.getElementById('jobs-list').innerHTML = html || '<tr><td colspan="6">Nenhuma Job ID</td></tr>';
        }
        
        async function carregarBoas() {
            const res = await fetch('/api/good-jobs');
            const jobs = await res.json();
            const html = jobs.map(job => \`
                <tr>
                    <td><code>\${job.job_id?.substring(0, 30)}...</code></td>
                    <td>\${job.total_brainrots || 0}</td>
                    <td>\${formatarValor(job.melhor_valor)}</td>
                    <td>\${job.melhor_brainrot || '-'}</td>
                </tr>
            \`).join('');
            document.getElementById('boas-list').innerHTML = html || '<tr><td colspan="4">Nenhuma Job ID BOA</td></tr>';
        }
        
        async function carregarBlacklist() {
            const res = await fetch('/api/blacklist');
            const blacklist = await res.json();
            const html = blacklist.map(job => \`
                <tr>
                    <td><code>\${job.job_id?.substring(0, 30)}...</code></td>
                    <td><span class="badge-bad">❌ BLACKLIST</span></td>
                    <td>Sem brainrot</td>
                    <td><button class="delete-btn" onclick="removerBlacklist('\${job.job_id}')">🗑️ Remover</button></td>
                </tr>
            \`).join('');
            document.getElementById('blacklist-list').innerHTML = html || '<tr><td colspan="4">Nenhuma Job ID na blacklist</td></tr>';
        }
        
        async function carregarBrainrots() {
            const res = await fetch('/api/brainrots');
            const brainrots = await res.json();
            const html = brainrots.map(b => \`
                <tr>
                    <td><strong>🧠 \${b.nome}</strong></td>
                    <td style="color:#ff6b35">💰 \${b.valor}</td>
                    <td><code>\${b.job_id?.substring(0, 20)}...</code></td>
                    <td>\${new Date(b.recebido_em).toLocaleString()}</td>
                </tr>
            \`).join('');
            document.getElementById('brainrots-list').innerHTML = html || '<tr><td colspan="4">Nenhum brainrot</td></tr>';
        }
        
        async function removerBlacklist(jobId) {
            await fetch(\`/api/blacklist/\${jobId}\`, { method: 'DELETE' });
            carregarTudo();
        }
        
        function formatarValor(valor) {
            if (valor >= 1e12) return (valor/1e12).toFixed(1) + 'T';
            if (valor >= 1e9) return (valor/1e9).toFixed(1) + 'B';
            if (valor >= 1e6) return (valor/1e6).toFixed(1) + 'M';
            if (valor >= 1e3) return (valor/1e3).toFixed(1) + 'K';
            return valor.toString();
        }
        
        function mudarTab(tab) {
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            
            if(tab === 'jobs') {
                document.getElementById('tab-jobs').classList.add('active');
                document.querySelector('.tabs button:first-child').classList.add('active');
                carregarJobs();
            } else if(tab === 'boas') {
                document.getElementById('tab-boas').classList.add('active');
                document.querySelector('.tabs button:nth-child(2)').classList.add('active');
                carregarBoas();
            } else if(tab === 'blacklist') {
                document.getElementById('tab-blacklist').classList.add('active');
                document.querySelector('.tabs button:nth-child(3)').classList.add('active');
                carregarBlacklist();
            } else if(tab === 'brainrots') {
                document.getElementById('tab-brainrots').classList.add('active');
                document.querySelector('.tabs button:nth-child(4)').classList.add('active');
                carregarBrainrots();
            }
        }
        
        async function carregarTudo() {
            await carregarStats();
            const tabAtiva = document.querySelector('.tab-content.active').id;
            if(tabAtiva === 'tab-jobs') carregarJobs();
            else if(tabAtiva === 'tab-boas') carregarBoas();
            else if(tabAtiva === 'tab-blacklist') carregarBlacklist();
            else if(tabAtiva === 'tab-brainrots') carregarBrainrots();
        }
        
        carregarTudo();
        setInterval(carregarTudo, 10000);
    </script>
</body>
</html>
    `);
});

// ================================================================
// INICIAR SERVIDOR
// ================================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log('🧠 IA UTILITIES - Brainrot Manager');
    console.log('='.repeat(50));
    console.log(`🚀 API: http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log('');
    console.log('✅ Status implementados:');
    console.log('  - "boa": Job ID com brainrot');
    console.log('  - "ruim": Job ID sem brainrot (blacklist)');
    console.log('  - "gameended": Servidor encerrado (blacklist)');
    console.log('  - "analisando": Status inicial');
    console.log('='.repeat(50));
});
