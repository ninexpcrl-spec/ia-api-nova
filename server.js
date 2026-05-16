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
let voidList = [];
let revisitarList = [];
let totalJobsProcessados = 0;
const LIMITE_PARA_LIBERAR = 25;

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

// Função para verificar e liberar revisitas
function verificarELiberarRevisitas() {
    totalJobsProcessados = Object.keys(jobIds).length;
    
    if (totalJobsProcessados >= LIMITE_PARA_LIBERAR && revisitarList.length === 0) {
        // Pega todas as Job IDs que estão na blacklist
        const blacklistIds = Object.values(jobIds)
            .filter(job => job.status === "blacklist")
            .map(job => job.job_id);
        
        if (blacklistIds.length > 0) {
            revisitarList = [...blacklistIds];
            console.log(`\n🎯 LIMITE DE ${LIMITE_PARA_LIBERAR} JOB IDs ATINGIDO!`);
            console.log(`📋 ${revisitarList.length} Job IDs da BLACKLIST serão revisitadas!`);
        }
    }
}

// ================================================================
// ENDPOINTS
// ================================================================

// Receber dados do Roblox
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
    
    // Inicializa Job ID se não existir
    if (!jobIds[jobId]) {
        jobIds[jobId] = {
            job_id: jobId,
            status: "analisando",
            primeiro_registro: new Date().toISOString(),
            ultimo_acesso: new Date().toISOString(),
            total_brainrots: 0,
            melhor_valor: 0,
            melhor_brainrot: null,
            players: players,
            revisitada: false
        };
    }
    
    // ATUALIZA STATUS da Job ID
    if (status === "boa" || (data.nome && status !== "ruim" && status !== "blacklist" && status !== "void")) {
        jobIds[jobId].status = "boa";
        jobIds[jobId].total_brainrots = (jobIds[jobId].total_brainrots || 0) + 1;
        jobIds[jobId].revisitada = true;
        
        if (data.valor_raw && data.valor_raw > (jobIds[jobId].melhor_valor || 0)) {
            jobIds[jobId].melhor_valor = data.valor_raw;
            jobIds[jobId].melhor_brainrot = data.nome;
        }
        
        console.log(`✅ Job ID ${jobId.substring(0,8)}... marcada como BOA`);
        
    } else if (status === "ruim" || status === "gameended" || data.motivo === "sem_brainrot") {
        jobIds[jobId].status = "blacklist";
        
        if (!blacklist.includes(jobId)) {
            blacklist.push(jobId);
            console.log(`❌ Job ID ${jobId.substring(0,8)}... enviada para BLACKLIST`);
        }
        
    } else if (status === "void") {
        jobIds[jobId].status = "void";
        
        if (!voidList.includes(jobId)) {
            voidList.push(jobId);
            console.log(`👻 Job ID ${jobId.substring(0,8)}... enviada para VOID`);
        }
        
    } else if (status === "blacklist") {
        if (!blacklist.includes(jobId)) blacklist.push(jobId);
        jobIds[jobId].status = "blacklist";
        
    } else {
        if (jobIds[jobId].status !== "boa" && jobIds[jobId].status !== "blacklist" && jobIds[jobId].status !== "void") {
            jobIds[jobId].status = "analisando";
        }
    }
    
    jobIds[jobId].ultimo_acesso = new Date().toISOString();
    jobIds[jobId].players = players;
    
    // SALVA BRAINROT
    if (data.nome) {
        const brainrot = {
            id: brainrots.length + 1,
            nome: data.nome,
            valor: data.valor || formatarValor(data.valor_raw || 0),
            valor_raw: data.valor_raw || 0,
            mutacao: data.mutacao,
            dono: data.dono,
            job_id: jobId,
            status: jobIds[jobId].status,
            players: players,
            timestamp: data.timestamp || Date.now(),
            recebido_em: new Date().toISOString()
        };
        
        brainrots.push(brainrot);
        console.log(`🧠 Brainrot salvo: ${data.nome}`);
    }
    
    // Verifica se atingiu o limite para liberar revisitas
    verificarELiberarRevisitas();
    
    res.json({
        success: true,
        job_id: jobId,
        status: jobIds[jobId].status,
        total_jobs: totalJobsProcessados,
        revisitas_disponiveis: revisitarList.length
    });
});

// Buscar próxima Job ID para revisitar (da blacklist)
app.get('/api/proxima-revisita', (req, res) => {
    if (revisitarList.length > 0) {
        const nextJobId = revisitarList.shift();
        console.log(`🎯 Próxima Job ID para revisitar: ${nextJobId.substring(0,8)}... (${revisitarList.length} restantes)`);
        res.json({ job_id: nextJobId, remaining: revisitarList.length });
    } else {
        res.json({ job_id: null, remaining: 0 });
    }
});

// Marcar Job ID como VOID (após revisita sem sucesso)
app.post('/api/marcar-void', (req, res) => {
    const { job_id } = req.body;
    
    if (!job_id) {
        return res.status(400).json({ error: "job_id é obrigatório" });
    }
    
    if (jobIds[job_id]) {
        jobIds[job_id].status = "void";
        jobIds[job_id].revisitada = true;
    }
    
    if (!voidList.includes(job_id)) {
        voidList.push(job_id);
    }
    
    // Remove da blacklist se estiver lá
    const blacklistIndex = blacklist.indexOf(job_id);
    if (blacklistIndex !== -1) {
        blacklist.splice(blacklistIndex, 1);
    }
    
    console.log(`👻 Job ID ${job_id.substring(0,8)}... movida para VOID (revisita sem sucesso)`);
    res.json({ success: true });
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
    const blacklisted = Object.values(jobIds).filter(job => job.status === "blacklist");
    res.json(blacklisted);
});

// Listar VOID
app.get('/api/void', (req, res) => {
    const voids = Object.values(jobIds).filter(job => job.status === "void");
    res.json(voids);
});

// Remover da blacklist (owner manual)
app.delete('/api/blacklist/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    const index = blacklist.indexOf(jobId);
    if (index !== -1) blacklist.splice(index, 1);
    if (jobIds[jobId]) jobIds[jobId].status = "analisando";
    res.json({ success: true });
});

// Remover do VOID (owner manual)
app.delete('/api/void/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    const index = voidList.indexOf(jobId);
    if (index !== -1) voidList.splice(index, 1);
    if (jobIds[jobId]) jobIds[jobId].status = "analisando";
    res.json({ success: true });
});

// Limpar todos os dados
app.post('/api/clear-all', (req, res) => {
    brainrots = [];
    jobIds = {};
    blacklist = [];
    voidList = [];
    revisitarList = [];
    totalJobsProcessados = 0;
    res.json({ success: true });
});

// Estatísticas
app.get('/api/stats', (req, res) => {
    const boas = Object.values(jobIds).filter(j => j.status === "boa").length;
    const ruins = Object.values(jobIds).filter(j => j.status === "blacklist").length;
    const voids = Object.values(jobIds).filter(j => j.status === "void").length;
    const analisando = Object.values(jobIds).filter(j => j.status === "analisando").length;
    const valorTotal = brainrots.reduce((sum, b) => sum + (b.valor_raw || 0), 0);
    
    res.json({
        total_brainrots: brainrots.length,
        total_job_ids: Object.keys(jobIds).length,
        limite_para_liberar: LIMITE_PARA_LIBERAR,
        total_atingido: totalJobsProcessados,
        faltam_para_liberar: Math.max(0, LIMITE_PARA_LIBERAR - totalJobsProcessados),
        job_ids_boas: boas,
        job_ids_blacklist: ruins,
        job_ids_void: voids,
        job_ids_analisando: analisando,
        revisitas_disponiveis: revisitarList.length,
        valor_total: formatarValor(valorTotal)
    });
});

// ================================================================
// DASHBOARD HTML
// ================================================================
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IA UTILITIES | Brainrot Manager</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #0f0c29 0%, #1a1a3e 50%, #24243e 100%);
            color: #fff;
            min-height: 100vh;
        }
        .container { max-width: 1400px; margin: 0 auto; padding: 30px 20px; }
        
        /* Header */
        .header { text-align: center; margin-bottom: 40px; }
        .logo {
            font-size: 2.5rem;
            font-weight: 800;
            background: linear-gradient(135deg, #a855f7, #d946ef, #ec4899);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
        }
        .logo i { background: none; -webkit-background-clip: unset; color: #a855f7; margin-right: 10px; }
        .subtitle { color: rgba(255,255,255,0.6); font-size: 0.9rem; margin-top: 10px; }
        
        /* Stats Cards */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: rgba(255,255,255,0.05);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 20px;
            text-align: center;
            border: 1px solid rgba(255,255,255,0.1);
            transition: all 0.3s;
        }
        .stat-card:hover { transform: translateY(-5px); background: rgba(255,255,255,0.08); }
        .stat-card i { font-size: 2rem; color: #a855f7; margin-bottom: 10px; }
        .stat-card h3 { font-size: 0.75rem; text-transform: uppercase; color: rgba(255,255,255,0.6); margin-bottom: 10px; }
        .stat-card .value { font-size: 1.8rem; font-weight: 700; background: linear-gradient(135deg, #fff, #a855f7); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .stat-card .value.good { background: linear-gradient(135deg, #00ff88, #00cc66); -webkit-background-clip: text; background-clip: text; }
        .stat-card .value.bad { background: linear-gradient(135deg, #ff4444, #cc0000); -webkit-background-clip: text; background-clip: text; }
        .stat-card .value.void { background: linear-gradient(135deg, #888, #555); -webkit-background-clip: text; background-clip: text; }
        .stat-card .value.warning { background: linear-gradient(135deg, #ffaa00, #ff6600); -webkit-background-clip: text; background-clip: text; }
        
        /* Progress Bar */
        .progress-container {
            background: rgba(255,255,255,0.1);
            border-radius: 30px;
            padding: 5px;
            margin-bottom: 30px;
        }
        .progress-bar {
            background: linear-gradient(90deg, #a855f7, #d946ef);
            border-radius: 30px;
            padding: 10px 20px;
            text-align: center;
            font-weight: 600;
            transition: width 0.5s ease;
        }
        
        /* Tabs */
        .tabs { display: flex; gap: 12px; margin-bottom: 25px; flex-wrap: wrap; }
        .tab-btn {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            color: rgba(255,255,255,0.7);
            padding: 10px 22px;
            border-radius: 40px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .tab-btn i { font-size: 0.9rem; }
        .tab-btn:hover { background: rgba(168,85,247,0.2); border-color: rgba(168,85,247,0.5); color: #fff; }
        .tab-btn.active { background: linear-gradient(135deg, #a855f7, #d946ef); border-color: transparent; color: #fff; box-shadow: 0 4px 15px rgba(168,85,247,0.3); }
        
        /* Buttons */
        .action-buttons { display: flex; gap: 12px; margin-bottom: 25px; flex-wrap: wrap; }
        .btn {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            color: #fff;
            padding: 10px 20px;
            border-radius: 40px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.3s;
        }
        .btn:hover { background: rgba(255,255,255,0.1); transform: translateY(-2px); }
        .btn-danger { background: rgba(255,68,68,0.15); border-color: rgba(255,68,68,0.3); }
        .btn-danger:hover { background: rgba(255,68,68,0.25); }
        
        /* Tables */
        .table-container {
            background: rgba(255,255,255,0.03);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            border: 1px solid rgba(255,255,255,0.1);
            overflow-x: auto;
            max-height: 500px;
            overflow-y: auto;
        }
        table { width: 100%; border-collapse: collapse; }
        th {
            text-align: left;
            padding: 15px;
            background: rgba(168,85,247,0.1);
            color: #a855f7;
            font-weight: 600;
            font-size: 0.8rem;
            text-transform: uppercase;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        td { padding: 12px 15px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.85rem; }
        tr:hover { background: rgba(168,85,247,0.05); }
        
        /* Badges */
        .badge-good { background: linear-gradient(135deg, rgba(0,255,136,0.15), rgba(0,204,102,0.05)); color: #00ff88; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; display: inline-block; }
        .badge-bad { background: linear-gradient(135deg, rgba(255,68,68,0.15), rgba(204,0,0,0.05)); color: #ff4444; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; display: inline-block; }
        .badge-void { background: linear-gradient(135deg, rgba(136,136,136,0.15), rgba(85,85,85,0.05)); color: #aaa; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; display: inline-block; }
        .badge-warning { background: linear-gradient(135deg, rgba(255,170,0,0.15), rgba(255,102,0,0.05)); color: #ffaa00; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; display: inline-block; }
        
        .delete-btn { background: rgba(255,68,68,0.15); border: none; color: #ff4444; padding: 6px 12px; border-radius: 8px; cursor: pointer; }
        .delete-btn:hover { background: rgba(255,68,68,0.3); }
        
        .brainrot-card {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 12px 15px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .brainrot-card:hover { background: rgba(168,85,247,0.05); }
        .brainrot-icon { width: 45px; height: 45px; background: linear-gradient(135deg, #a855f7, #d946ef); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; }
        .brainrot-info { flex: 1; }
        .brainrot-name { font-weight: 600; margin-bottom: 5px; }
        .brainrot-value { color: #a855f7; font-weight: 600; }
        .brainrot-meta { font-size: 0.7rem; color: rgba(255,255,255,0.5); }
        
        .tab-content { display: none; }
        .tab-content.active { display: block; animation: fadeIn 0.3s; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); border-radius: 10px; }
        ::-webkit-scrollbar-thumb { background: #a855f7; border-radius: 10px; }
        
        @media (max-width: 768px) {
            .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
            .stat-card { padding: 12px; }
            .stat-card .value { font-size: 1.2rem; }
            th, td { padding: 8px 10px; font-size: 0.7rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo"><i class="fas fa-brain"></i> IA UTILITIES</div>
            <div class="subtitle">Sistema de blacklist e revisita automática</div>
        </div>

        <div class="stats-grid" id="stats"></div>
        
        <div class="progress-container" id="progress-container"></div>

        <div class="action-buttons">
            <button class="btn" onclick="carregarTudo()"><i class="fas fa-sync-alt"></i> Atualizar</button>
            <button class="btn btn-danger" onclick="limparTudo()"><i class="fas fa-trash-alt"></i> Limpar Todos os Dados</button>
        </div>

        <div class="tabs">
            <button class="tab-btn active" onclick="mudarTab('jobs')"><i class="fas fa-database"></i> Todas</button>
            <button class="tab-btn" onclick="mudarTab('boas')"><i class="fas fa-star"></i> BOAS</button>
            <button class="tab-btn" onclick="mudarTab('blacklist')"><i class="fas fa-skull"></i> BLACKLIST</button>
            <button class="tab-btn" onclick="mudarTab('void')"><i class="fas fa-ghost"></i> VOID</button>
            <button class="tab-btn" onclick="mudarTab('brainrots')"><i class="fas fa-brain"></i> Brainrots</button>
        </div>

        <div id="tab-jobs" class="tab-content active">
            <div class="table-container"><table><thead><tr><th>Job ID</th><th>Status</th><th>Brainrots</th><th>Melhor Valor</th><th>Melhor Brainrot</th><th>Players</th></tr></thead><tbody id="jobs-list"></tbody></table></div>
        </div>
        <div id="tab-boas" class="tab-content">
            <div class="table-container"><table><thead><tr><th>Job ID</th><th>Brainrots</th><th>Melhor Valor</th><th>Melhor Brainrot</th></tr></thead><tbody id="boas-list"></tbody></table></div>
        </div>
        <div id="tab-blacklist" class="tab-content">
            <div class="table-container"><table><thead><tr><th>Job ID</th><th>Status</th><th>Ações</th></tr></thead><tbody id="blacklist-list"></tbody></table></div>
        </div>
        <div id="tab-void" class="tab-content">
            <div class="table-container"><table><thead><tr><th>Job ID</th><th>Status</th><th>Ações</th></tr></thead><tbody id="void-list"></tbody></table></div>
        </div>
        <div id="tab-brainrots" class="tab-content">
            <div class="table-container" id="brainrots-list"></div>
        </div>
    </div>

    <script>
        async function carregarStats() {
            const res = await fetch('/api/stats');
            const stats = await res.json();
            document.getElementById('stats').innerHTML = \`
                <div class="stat-card"><i class="fas fa-brain"></i><h3>Brainrots</h3><div class="value">\${stats.total_brainrots}</div></div>
                <div class="stat-card"><i class="fas fa-star"></i><h3>BOAS</h3><div class="value good">\${stats.job_ids_boas}</div></div>
                <div class="stat-card"><i class="fas fa-skull"></i><h3>BLACKLIST</h3><div class="value bad">\${stats.job_ids_blacklist}</div></div>
                <div class="stat-card"><i class="fas fa-ghost"></i><h3>VOID</h3><div class="value void">\${stats.job_ids_void}</div></div>
                <div class="stat-card"><i class="fas fa-clock"></i><h3>Analisando</h3><div class="value warning">\${stats.job_ids_analisando}</div></div>
                <div class="stat-card"><i class="fas fa-coins"></i><h3>Valor Total</h3><div class="value">\${stats.valor_total}</div></div>
            \`;
            
            const percent = (stats.total_job_ids / stats.limite_para_liberar) * 100;
            document.getElementById('progress-container').innerHTML = \`
                <div class="progress-bar" style="width: \${Math.min(percent, 100)}%">
                    📊 \${stats.total_job_ids} / \${stats.limite_para_liberar} Job IDs
                    \${stats.revisitas_disponiveis > 0 ? \` | 🎯 \${stats.revisitas_disponiveis} revisitas disponíveis\` : ''}
                </div>
            \`;
        }

        async function carregarJobs() {
            const res = await fetch('/api/jobs');
            const jobs = await res.json();
            const html = jobs.map(job => {
                let badge = '';
                if (job.status === 'boa') badge = '<span class="badge-good"><i class="fas fa-check"></i> BOA</span>';
                else if (job.status === 'blacklist') badge = '<span class="badge-bad"><i class="fas fa-skull"></i> BLACKLIST</span>';
                else if (job.status === 'void') badge = '<span class="badge-void"><i class="fas fa-ghost"></i> VOID</span>';
                else badge = '<span class="badge-warning"><i class="fas fa-hourglass-half"></i> ANALISANDO</span>';
                return \`<tr><td><code>\${job.job_id?.substring(0, 30)}...</code></td><td>\${badge}</td><td>\${job.total_brainrots || 0}</td><td>\${job.melhor_valor ? formatarValor(job.melhor_valor) : '-'}</td><td>\${job.melhor_brainrot || '-'}</td><td>\${job.players || '-'}</td></tr>\`;
            }).join('');
            document.getElementById('jobs-list').innerHTML = html || '<tr><td colspan="6">Nenhuma Job ID</td></tr>';
        }

        async function carregarBoas() {
            const res = await fetch('/api/good-jobs');
            const jobs = await res.json();
            const html = jobs.map(job => \`<tr><td><code>\${job.job_id?.substring(0, 30)}...</code></td><td>\${job.total_brainrots || 0}</td><td>\${formatarValor(job.melhor_valor)}</td><td>\${job.melhor_brainrot || '-'}</td></tr>\`).join('');
            document.getElementById('boas-list').innerHTML = html || '<tr><td colspan="4">Nenhuma Job ID BOA</td></tr>';
        }

        async function carregarBlacklist() {
            const res = await fetch('/api/blacklist');
            const blacklist = await res.json();
            const html = blacklist.map(job => \`<tr><td><code>\${job.job_id?.substring(0, 30)}...</code></td><td><span class="badge-bad"><i class="fas fa-skull"></i> BLACKLIST</span></td><td><button class="delete-btn" onclick="removerBlacklist('\${job.job_id}')"><i class="fas fa-trash"></i> Remover</button></td></tr>\`).join('');
            document.getElementById('blacklist-list').innerHTML = html || '<tr><td colspan="3">Nenhuma Job ID na BLACKLIST</td></tr>';
        }

        async function carregarVoid() {
            const res = await fetch('/api/void');
            const voids = await res.json();
            const html = voids.map(job => \`<tr><td><code>\${job.job_id?.substring(0, 30)}...</code></td><td><span class="badge-void"><i class="fas fa-ghost"></i> VOID</span></td><td><button class="delete-btn" onclick="removerVoid('\${job.job_id}')"><i class="fas fa-trash"></i> Remover</button></td></tr>\`).join('');
            document.getElementById('void-list').innerHTML = html || '<tr><td colspan="3">Nenhuma Job ID no VOID</td></tr>';
        }

        async function carregarBrainrots() {
            const res = await fetch('/api/brainrots');
            const brainrots = await res.json();
            const html = brainrots.map(b => \`
                <div class="brainrot-card">
                    <div class="brainrot-icon"><i class="fas fa-brain"></i></div>
                    <div class="brainrot-info"><div class="brainrot-name"><strong>\${b.nome}</strong></div><div class="brainrot-value">💰 \${b.valor}</div><div class="brainrot-meta"><i class="fas fa-code-branch"></i> \${b.job_id?.substring(0, 20)}... | <i class="far fa-clock"></i> \${new Date(b.recebido_em).toLocaleString()}</div></div>
                </div>
            \`).join('');
            document.getElementById('brainrots-list').innerHTML = html || '<div class="empty-state">Nenhum brainrot</div>';
        }

        async function removerBlacklist(jobId) { await fetch(\`/api/blacklist/\${jobId}\`, { method: 'DELETE' }); carregarTudo(); }
        async function removerVoid(jobId) { await fetch(\`/api/void/\${jobId}\`, { method: 'DELETE' }); carregarTudo(); }
        async function limparTudo() { if(confirm('⚠️ ISSO VAI APAGAR TODOS OS DADOS!')) { await fetch('/api/clear-all', { method: 'POST' }); carregarTudo(); } }

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
            if(tab === 'jobs') { document.getElementById('tab-jobs').classList.add('active'); document.querySelector('.tabs button:first-child').classList.add('active'); carregarJobs(); }
            else if(tab === 'boas') { document.getElementById('tab-boas').classList.add('active'); document.querySelector('.tabs button:nth-child(2)').classList.add('active'); carregarBoas(); }
            else if(tab === 'blacklist') { document.getElementById('tab-blacklist').classList.add('active'); document.querySelector('.tabs button:nth-child(3)').classList.add('active'); carregarBlacklist(); }
            else if(tab === 'void') { document.getElementById('tab-void').classList.add('active'); document.querySelector('.tabs button:nth-child(4)').classList.add('active'); carregarVoid(); }
            else if(tab === 'brainrots') { document.getElementById('tab-brainrots').classList.add('active'); document.querySelector('.tabs button:nth-child(5)').classList.add('active'); carregarBrainrots(); }
        }

        async function carregarTudo() {
            await carregarStats();
            const tabAtiva = document.querySelector('.tab-content.active').id;
            if(tabAtiva === 'tab-jobs') carregarJobs();
            else if(tabAtiva === 'tab-boas') carregarBoas();
            else if(tabAtiva === 'tab-blacklist') carregarBlacklist();
            else if(tabAtiva === 'tab-void') carregarVoid();
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
    console.log('📋 NOVO SISTEMA:');
    console.log('  - Acumula 25 Job IDs para liberar revisitas');
    console.log('  - Job IDs da BLACKLIST são revisitadas');
    console.log('  - Se não encontrar nada → VOID');
    console.log('  - Se encontrar algo → BOA');
    console.log('='.repeat(50));
});
