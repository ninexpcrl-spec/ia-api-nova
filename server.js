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
let totalJobIdsProcessados = 0;
const LIMITE_PARA_RESET = 25;

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

function getRarity(valor) {
    if (valor >= 50000000) return { nome: "GOD", cor: "#ff00ff", emoji: "👑" };
    if (valor >= 10000000) return { nome: "MYTHIC", cor: "#ff6600", emoji: "🌈" };
    if (valor >= 5000000) return { nome: "EPIC", cor: "#aa00ff", emoji: "💜" };
    if (valor >= 1000000) return { nome: "OG", cor: "#00ff00", emoji: "⭐" };
    return { nome: "RARE", cor: "#3399ff", emoji: "💙" };
}

// Função para resetar todos os dados
function resetAllData() {
    console.log("=".repeat(50));
    console.log(`🔄 RESETANDO TODOS OS DADOS! ${totalJobIdsProcessados} Job IDs processadas.`);
    console.log("=".repeat(50));
    
    brainrots = [];
    jobIds = {};
    blacklist = [];
    totalJobIdsProcessados = 0;
    
    console.log("✅ Dados resetados com sucesso!");
    console.log("📊 Próximo reset em: " + LIMITE_PARA_RESET + " Job IDs");
    console.log("=".repeat(50));
}

// Verificar se atingiu o limite e resetar
function checkAndReset() {
    if (totalJobIdsProcessados >= LIMITE_PARA_RESET) {
        resetAllData();
        return true;
    }
    return false;
}

// ================================================================
// ENDPOINTS
// ================================================================

// Receber dados do Roblox
app.post('/api/brainrot', (req, res) => {
    console.log("📡 Recebido:", req.body);
    
    let data = req.body;
    if (req.body.data) data = req.body.data;
    
    const jobId = data.job_id || data.servidor || "desconhecido";
    
    // Incrementa contador de Job IDs processadas
    totalJobIdsProcessados++;
    console.log(`📊 Job IDs processadas: ${totalJobIdsProcessados}/${LIMITE_PARA_RESET}`);
    
    // Atualiza Job ID
    if (!jobIds[jobId]) {
        jobIds[jobId] = {
            job_id: jobId,
            tentativas: 0,
            max_tentativas: 5,
            status: "analisando",
            brainrots: [],
            melhor_valor: 0,
            melhor_brainrot: null,
            ultimo_acesso: new Date().toISOString()
        };
    }
    
    // Se tem brainrot
    if (data.nome || data.brainrot) {
        const nome = data.nome || data.brainrot;
        const valor = data.valor_raw || data.valor || 0;
        const valorFormatado = data.valor || formatarValor(valor);
        
        const brainrot = {
            id: brainrots.length + 1,
            nome: nome,
            valor: valorFormatado,
            valor_raw: valor,
            raridade: getRarity(valor).nome,
            emoji: getRarity(valor).emoji,
            cor: getRarity(valor).cor,
            job_id: jobId,
            imagem: `https://stealabrainrot.fandom.com/wiki/${encodeURIComponent(nome)}`,
            timestamp: data.timestamp || Date.now(),
            data_hora: new Date().toISOString()
        };
        
        brainrots.push(brainrot);
        
        // Atualiza Job ID
        jobIds[jobId].brainrots.push(brainrot);
        jobIds[jobId].tentativas = 0;
        jobIds[jobId].status = "boa";
        
        if (valor > jobIds[jobId].melhor_valor) {
            jobIds[jobId].melhor_valor = valor;
            jobIds[jobId].melhor_brainrot = nome;
        }
        
        console.log(`✅ Brainrot salvo: ${nome} - ${valorFormatado}`);
    } else {
        // Só Job ID (sem brainrot)
        if (!blacklist.includes(jobId) && jobIds[jobId].status !== "blacklist") {
            jobIds[jobId].tentativas++;
            console.log(`📊 Job ID ${jobId.substring(0,8)}... tentativa ${jobIds[jobId].tentativas}/${jobIds[jobId].max_tentativas}`);
            
            if (jobIds[jobId].tentativas >= jobIds[jobId].max_tentativas) {
                jobIds[jobId].status = "blacklist";
                blacklist.push(jobId);
                console.log(`⚠️ Job ID ${jobId.substring(0,8)}... movida para BLACKLIST (${jobIds[jobId].tentativas} tentativas sem sucesso)`);
            }
        }
    }
    
    jobIds[jobId].ultimo_acesso = new Date().toISOString();
    
    // Verifica se atingiu o limite e reseta os dados
    const resetou = checkAndReset();
    
    res.json({
        success: true,
        job_status: jobIds[jobId].status,
        tentativas: jobIds[jobId].tentativas,
        max_tentativas: jobIds[jobId].max_tentativas,
        total_processadas: totalJobIdsProcessados,
        limite_para_reset: LIMITE_PARA_RESET,
        reset_aconteceu: resetou
    });
});

// Listar Job IDs (boas e ruins)
app.get('/api/jobs', (req, res) => {
    const lista = Object.values(jobIds).map(job => ({
        ...job,
        melhor_valor_formatado: formatarValor(job.melhor_valor)
    }));
    res.json(lista);
});

// Listar apenas Job IDs boas (para o Roblox voltar)
app.get('/api/good-jobs', (req, res) => {
    const boas = Object.values(jobIds).filter(job => job.status === "boa" || (job.tentativas < job.max_tentativas && job.status !== "blacklist"));
    res.json(boas);
});

// Listar blacklist
app.get('/api/blacklist', (req, res) => {
    const blacklisted = Object.values(jobIds).filter(job => job.status === "blacklist");
    res.json(blacklisted);
});

// Listar brainrots
app.get('/api/brainrots', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json(brainrots.slice(-limit).reverse());
});

// Estatísticas
app.get('/api/stats', (req, res) => {
    const boas = Object.values(jobIds).filter(j => j.status === "boa").length;
    const ruins = Object.values(jobIds).filter(j => j.status === "blacklist").length;
    const analisando = Object.values(jobIds).filter(j => j.status === "analisando").length;
    
    const valorTotal = brainrots.reduce((sum, b) => sum + (b.valor_raw || 0), 0);
    const faltam = Math.max(0, LIMITE_PARA_RESET - totalJobIdsProcessados);
    
    res.json({
        total_brainrots: brainrots.length,
        total_job_ids: Object.keys(jobIds).length,
        job_ids_boas: boas,
        job_ids_ruins: ruins,
        job_ids_analisando: analisando,
        valor_total: formatarValor(valorTotal),
        maior_valor: brainrots.length > 0 ? formatarValor(Math.max(...brainrots.map(b => b.valor_raw || 0))) : 0,
        total_processadas: totalJobIdsProcessados,
        limite_para_reset: LIMITE_PARA_RESET,
        faltam_para_reset: faltam,
        proximo_reset_em: faltam
    });
});

// Reset manual (endpoint separado)
app.post('/api/reset', (req, res) => {
    resetAllData();
    res.json({ success: true, message: "Dados resetados manualmente!" });
});

// Remover Job ID da blacklist
app.delete('/api/job/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    if (jobIds[jobId]) {
        delete jobIds[jobId];
    }
    const index = blacklist.indexOf(jobId);
    if (index !== -1) blacklist.splice(index, 1);
    res.json({ success: true });
});

// Limpar todos os dados (mantido para compatibilidade)
app.post('/api/clear-all', (req, res) => {
    brainrots = [];
    jobIds = {};
    blacklist = [];
    totalJobIdsProcessados = 0;
    res.json({ success: true });
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
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: rgba(255,255,255,0.1);
            border-radius: 15px;
            padding: 20px;
            text-align: center;
            backdrop-filter: blur(10px);
            transition: transform 0.3s;
        }
        .stat-card:hover { transform: translateY(-5px); }
        .stat-card h3 { font-size: 0.85em; opacity: 0.8; margin-bottom: 10px; }
        .stat-card .value { font-size: 1.8em; font-weight: bold; color: #ff6b35; }
        .stat-card .value.good { color: #00ff88; }
        .stat-card .value.bad { color: #ff4444; }
        .stat-card .value.warning { color: #ffaa00; }
        
        .reset-bar {
            background: rgba(255,255,255,0.05);
            border-radius: 30px;
            padding: 15px 20px;
            margin-bottom: 30px;
            text-align: center;
        }
        .reset-progress {
            background: linear-gradient(90deg, #ff6b35, #ff4444);
            border-radius: 20px;
            height: 10px;
            margin-top: 10px;
            transition: width 0.5s;
        }
        
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
            padding: 12px 24px;
            border-radius: 30px;
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
        .btn-warning { background: rgba(255,170,0,0.3); }
        
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
        
        .brainrot-card {
            display: flex;
            align-items: center;
            gap: 15px;
            background: rgba(255,255,255,0.08);
            border-radius: 12px;
            padding: 15px;
            margin-bottom: 10px;
        }
        .brainrot-img {
            width: 60px;
            height: 60px;
            background: rgba(255,255,255,0.1);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2em;
        }
        .brainrot-info { flex: 1; }
        .brainrot-name { font-weight: bold; font-size: 1.1em; }
        .brainrot-value { color: #ff6b35; font-weight: bold; }
        .brainrot-meta { font-size: 0.8em; opacity: 0.7; }
        
        .badge-good { background: rgba(0,255,136,0.2); color: #00ff88; padding: 4px 8px; border-radius: 20px; font-size: 0.8em; }
        .badge-bad { background: rgba(255,68,68,0.2); color: #ff4444; padding: 4px 8px; border-radius: 20px; font-size: 0.8em; }
        .badge-warning { background: rgba(255,170,0,0.2); color: #ffaa00; padding: 4px 8px; border-radius: 20px; font-size: 0.8em; }
        
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        
        @media (max-width: 768px) {
            th, td { padding: 8px; font-size: 0.8em; }
            .stats-grid { grid-template-columns: repeat(2, 1fr); }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧠 <span>IA UTILITIES</span> - Brainrot Manager</h1>
        <div class="subtitle">Reset automático a cada 25 Job IDs</div>
        
        <div class="stats-grid" id="stats"></div>
        
        <div class="reset-bar" id="reset-bar"></div>
        
        <div class="action-buttons">
            <button class="btn btn-danger" onclick="limparTudo()">⚠️ Limpar Todos os Dados</button>
            <button class="btn btn-warning" onclick="resetarAgora()">🔄 Resetar Agora</button>
            <button class="btn" onclick="carregarTudo()">🔄 Atualizar</button>
        </div>
        
        <div class="tabs">
            <button class="tab-btn active" onclick="mudarTab('brainrots')">🧠 Brainrots</button>
            <button class="tab-btn" onclick="mudarTab('jobs-boas')">✅ Job IDs Boas</button>
            <button class="tab-btn" onclick="mudarTab('jobs-analisando')">⏳ Analisando</button>
            <button class="tab-btn" onclick="mudarTab('jobs-ruins')">❌ Blacklist</button>
        </div>
        
        <div id="tab-brainrots" class="tab-content active">
            <div class="table-container">
                <div id="brainrots-list"></div>
            </div>
        </div>
        
        <div id="tab-jobs-boas" class="tab-content">
            <div class="table-container">
                <table>
                    <thead><tr><th>Job ID</th><th>Melhor Brainrot</th><th>Valor</th><th>Brainrots</th><th>Tentativas</th><th>Status</th></tr></thead>
                    <tbody id="jobs-boas-list"></tbody>
                </table>
            </div>
        </div>
        
        <div id="tab-jobs-analisando" class="tab-content">
            <div class="table-container">
                <table>
                    <thead><tr><th>Job ID</th><th>Tentativas</th><th>Máx</th><th>Status</th></tr></thead>
                    <tbody id="jobs-analisando-list"></tbody>
                </table>
            </div>
        </div>
        
        <div id="tab-jobs-ruins" class="tab-content">
            <div class="table-container">
                <tr>
                    <thead><tr><th>Job ID</th><th>Brainrots</th><th>Motivo</th><th>Ações</th></tr></thead>
                    <tbody id="jobs-ruins-list"></tbody>
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
                <div class="stat-card"><h3>✅ Job IDs Boas</h3><div class="value good">\${stats.job_ids_boas}</div></div>
                <div class="stat-card"><h3>⏳ Analisando</h3><div class="value">\${stats.job_ids_analisando}</div></div>
                <div class="stat-card"><h3>❌ Blacklist</h3><div class="value bad">\${stats.job_ids_ruins}</div></div>
                <div class="stat-card"><h3>💰 Valor Total</h3><div class="value">\${stats.valor_total}</div></div>
            \`;
            
            const percent = (stats.total_processadas / stats.limite_para_reset) * 100;
            document.getElementById('reset-bar').innerHTML = \`
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span>🔄 Reset automático</span>
                    <span>\${stats.total_processadas} / \${stats.limite_para_reset} Job IDs</span>
                </div>
                <div style="background: rgba(255,255,255,0.1); border-radius: 10px; overflow: hidden;">
                    <div class="reset-progress" style="width: \${Math.min(percent, 100)}%;"></div>
                </div>
                <div style="margin-top: 10px; font-size: 0.8em; opacity: 0.7;">
                    ⚡ Reset automático quando atingir \${stats.limite_para_reset} Job IDs
                </div>
            \`;
        }
        
        async function resetarAgora() {
            if(confirm('⚠️ TEM CERTEZA? Isso vai apagar TODOS OS DADOS!')) {
                await fetch('/api/reset', { method: 'POST' });
                carregarTudo();
            }
        }
        
        async function carregarBrainrots() {
            const res = await fetch('/api/brainrots?limit=50');
            const brainrots = await res.json();
            const html = brainrots.map(b => \`
                <div class="brainrot-card" style="border-left: 4px solid \${b.cor || '#ff6b35'}">
                    <div class="brainrot-img">\${b.emoji || '🧠'}</div>
                    <div class="brainrot-info">
                        <div class="brainrot-name">\${b.nome}</div>
                        <div class="brainrot-value">💰 \${b.valor}</div>
                        <div class="brainrot-meta">📡 \${b.job_id?.substring(0, 20)}... | 🕒 \${new Date(b.data_hora).toLocaleString()}</div>
                    </div>
                    <div class="badge-good">\${b.raridade}</div>
                </div>
            \`).join('');
            document.getElementById('brainrots-list').innerHTML = html || '<p>Nenhum brainrot encontrado</p>';
        }
        
        async function carregarJobsBoas() {
            const res = await fetch('/api/jobs');
            const jobs = await res.json();
            const boas = jobs.filter(j => j.status === 'boa');
            const html = boas.map(job => \`
                <tr>
                    <td><code>\${job.job_id?.substring(0, 30)}...</code></td>
                    <td>\${job.melhor_brainrot || '-'}</td>
                    <td style="color:#ff6b35">\${job.melhor_valor_formatado || '-'}</td>
                    <td>\${job.brainrots?.length || 0}</td>
                    <td><span class="badge-good">\${job.tentativas}/\${job.max_tentativas}</span></td>
                    <td><span class="badge-good">✅ BOA</span></td>
                </tr>
            \`).join('');
            document.getElementById('jobs-boas-list').innerHTML = html || '<tr><td colspan="6">Nenhuma Job ID boa</td></tr>';
        }
        
        async function carregarJobsAnalisando() {
            const res = await fetch('/api/jobs');
            const jobs = await res.json();
            const analisando = jobs.filter(j => j.status === 'analisando' || (j.tentativas < j.max_tentativas && j.status !== 'boa' && j.status !== 'blacklist'));
            const html = analisando.map(job => \`
                <tr>
                    <td><code>\${job.job_id?.substring(0, 30)}...</code></td>
                    <td><span class="badge-warning">\${job.tentativas}/\${job.max_tentativas}</span></td>
                    <td>\${job.max_tentativas}</td>
                    <td><span class="badge-warning">⏳ ANALISANDO</span></td>
                </tr>
            \`).join('');
            document.getElementById('jobs-analisando-list').innerHTML = html || '<tr><td colspan="4">Nenhuma Job ID em análise</td></tr>';
        }
        
        async function carregarJobsRuins() {
            const res = await fetch('/api/blacklist');
            const blacklist = await res.json();
            const html = blacklist.map(job => \`
                <tr>
                    <td><code>\${job.job_id?.substring(0, 30)}...</code></td>
                    <td>\${job.brainrots?.length || 0}</td>
                    <td>\${job.tentativas} tentativas sem sucesso</span></td>
                    <td><button class="btn btn-danger" onclick="removerJob('\${job.job_id}')">🗑️ Remover</button></td>
                </tr>
            \`).join('');
            document.getElementById('jobs-ruins-list').innerHTML = html || '<tr><td colspan="4">Nenhuma Job ID na blacklist</span></td></tr>';
        }
        
        async function removerJob(jobId) {
            await fetch(\`/api/job/\${jobId}\`, { method: 'DELETE' });
            carregarTudo();
        }
        
        async function limparTudo() {
            if(confirm('⚠️ ISSO VAI APAGAR TODOS OS DADOS!')) {
                await fetch('/api/clear-all', { method: 'POST' });
                carregarTudo();
            }
        }
        
        function mudarTab(tab) {
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            
            if(tab === 'brainrots') {
                document.getElementById('tab-brainrots').classList.add('active');
                document.querySelector('.tabs button:first-child').classList.add('active');
                carregarBrainrots();
            } else if(tab === 'jobs-boas') {
                document.getElementById('tab-jobs-boas').classList.add('active');
                document.querySelector('.tabs button:nth-child(2)').classList.add('active');
                carregarJobsBoas();
            } else if(tab === 'jobs-analisando') {
                document.getElementById('tab-jobs-analisando').classList.add('active');
                document.querySelector('.tabs button:nth-child(3)').classList.add('active');
                carregarJobsAnalisando();
            } else if(tab === 'jobs-ruins') {
                document.getElementById('tab-jobs-ruins').classList.add('active');
                document.querySelector('.tabs button:nth-child(4)').classList.add('active');
                carregarJobsRuins();
            }
        }
        
        async function carregarTudo() {
            await carregarStats();
            const tabAtiva = document.querySelector('.tab-content.active').id;
            if(tabAtiva === 'tab-brainrots') carregarBrainrots();
            else if(tabAtiva === 'tab-jobs-boas') carregarJobsBoas();
            else if(tabAtiva === 'tab-jobs-analisando') carregarJobsAnalisando();
            else if(tabAtiva === 'tab-jobs-ruins') carregarJobsRuins();
        }
        
        carregarTudo();
        setInterval(carregarTudo, 10000);
    </script>
</body>
</html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log('🧠 IA UTILITIES - Brainrot Manager');
    console.log('='.repeat(50));
    console.log(`🚀 API: http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔄 Reset automático a cada ${LIMITE_PARA_RESET} Job IDs`);
    console.log('='.repeat(50));
});
