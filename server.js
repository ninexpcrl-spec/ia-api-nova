const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ================================================================
// WEBHOOK DO DISCORD (COLOQUE SEU WEBHOOK AQUI)
// ================================================================
const DISCORD_WEBHOOK_URL = "https://discordapp.com/api/webhooks/1505340515422572624/K97EBEhdjQ4yumrtZr0iQxi2JnOcPdFukNe0QJVJG6GRMkH93hgWvj29ixtx2ZvAEbSz";

// ================================================================
// EMOJIS POR MUTAÇÃO
// ================================================================
const MUTATION_EMOJIS = {
    "Rainbow": "🌈",
    "Diamond": "🔷",
    "Gold": "🟡",
    "Shiny": "✨",
    "Cosmic": "🌌",
    "Shadow": "🖤",
    "Lava": "🌋",
    "Cursed": "😈",
    "Divine": "✨",
    "YinYang": "☯️",
    "Candy": "🍬",
    "BloodRot": "🩸",
    "Default": "🔲"
};

// ================================================================
// FUNÇÃO PARA FORMATAR VALOR
// ================================================================
function formatarValor(valor) {
    if (valor >= 1e12) return (valor/1e12).toFixed(1) + 'T';
    if (valor >= 1e9) return (valor/1e9).toFixed(1) + 'B';
    if (valor >= 1e6) return (valor/1e6).toFixed(1) + 'M';
    if (valor >= 1e3) return (valor/1e3).toFixed(1) + 'K';
    return valor.toString();
}

// ================================================================
// FUNÇÃO PARA CRIAR EMBED ESTILO HELL NOTIFIER
// ================================================================
function criarEmbedHell(best, outros, jobId, players) {
    // Define cor baseada no valor
    let color = 0xAA00FF;
    let rarityEmoji = "💜";
    let rarityText = "EPIC";
    
    if (best.valor_raw >= 1000000000) {
        color = 0xFFD700;
        rarityEmoji = "👑";
        rarityText = "GOD";
    } else if (best.valor_raw >= 500000000) {
        color = 0xAA00FF;
        rarityEmoji = "🌈";
        rarityText = "MYTHIC";
    } else if (best.valor_raw >= 100000000) {
        color = 0xAA00FF;
        rarityEmoji = "💜";
        rarityText = "EPIC";
    } else if (best.valor_raw >= 50000000) {
        color = 0x00FFAA;
        rarityEmoji = "⭐";
        rarityText = "OG";
    } else if (best.valor_raw >= 10000000) {
        color = 0x3399FF;
        rarityEmoji = "💙";
        rarityText = "RARE";
    }
    
    // Emoji da mutação do melhor brainrot
    const mutEmoji = MUTATION_EMOJIS[best.mutacao] || "🔲";
    
    // Título
    const title = `${mutEmoji} 1x ${best.nome} $${best.valor}/s`;
    
    // Descrição com "Others"
    let description = "";
    if (outros && outros.length > 0) {
        description = "**Others**\n";
        for (let i = 0; i < Math.min(outros.length, 15); i++) {
            const outro = outros[i];
            const outroEmoji = MUTATION_EMOJIS[outro.mutacao] || "🔲";
            description += `1x ${outroEmoji} ${outro.nome} ($${outro.valor})\n`;
        }
        if (outros.length > 15) {
            description += `*e mais ${outros.length - 15} outros...*`;
        }
    }
    
    // Embed completo
    return {
        title: title,
        description: description,
        color: color,
        fields: [
            { name: "Job ID", value: `\`\`\`${jobId}\`\`\``, inline: false },
            { name: "Players", value: players.toString(), inline: true },
            { name: "Rarity", value: `${rarityEmoji} ${rarityText}`, inline: true }
        ],
        footer: { text: "IA UTILITIES | " + new Date().toLocaleTimeString() },
        timestamp: new Date().toISOString()
    };
}

// ================================================================
// FUNÇÃO PARA ENVIAR PARA O DISCORD
// ================================================================
async function enviarParaDiscord(embed) {
    const fetch = await import('node-fetch').then(m => m.default);
    
    const payload = {
        username: "IA UTILITIES",
        embeds: [embed]
    };
    
    try {
        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        console.log("✅ Embed enviada para o Discord!");
    } catch (error) {
        console.log("❌ Erro ao enviar para o Discord:", error.message);
    }
}

// ================================================================
// ENDPOINT PARA RECEBER DADOS DO ROBLOX
// ================================================================
app.post('/api/brainrot', async (req, res) => {
    console.log("📡 Recebido do Roblox:", req.body);
    
    let data = req.body;
    if (req.body.data) data = req.body.data;
    
    const jobId = data.job_id || "desconhecido";
    const players = data.players || 1;
    
    // Se veio um brainrot
    if (data.nome) {
        const best = {
            nome: data.nome,
            valor: data.valor,
            valor_raw: data.valor_raw,
            mutacao: data.mutacao
        };
        
        const outros = data.outros || [];
        
        // Cria a embed
        const embed = criarEmbedHell(best, outros, jobId, players);
        
        // Envia para o Discord
        await enviarParaDiscord(embed);
        
        res.json({ success: true, message: "Embed enviada para o Discord!" });
    } else {
        res.json({ success: false, message: "Nenhum brainrot recebido" });
    }
});

// ================================================================
// ENDPOINT PARA TESTAR A EMBED
// ================================================================
app.get('/api/teste', async (req, res) => {
    const brainrotExemplo = {
        nome: "Spyder Elephant",
        valor: "79.0B",
        valor_raw: 79000000000,
        mutacao: "Default"
    };
    
    const outrosExemplo = [
        { nome: "La Supreme Combination", valor: "2.4B", valor_raw: 2400000000, mutacao: "Default" },
        { nome: "Headless Horseman", valor: "1.9B", valor_raw: 1900000000, mutacao: "Default" },
        { nome: "Strawberry Elephant", valor: "12.8B", valor_raw: 12800000000, mutacao: "Default" }
    ];
    
    const embed = criarEmbedHell(brainrotExemplo, outrosExemplo, "teste-123", 5);
    await enviarParaDiscord(embed);
    
    res.json({ success: true, message: "Teste enviado para o Discord!" });
});

// ================================================================
// DASHBOARD
// ================================================================
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>IA UTILITIES</title>
            <style>
                body {
                    background: linear-gradient(135deg, #0f0c29, #302b63);
                    color: white;
                    font-family: Arial;
                    padding: 20px;
                }
                h1 { color: #ff6b35; }
                .card {
                    background: rgba(255,255,255,0.1);
                    padding: 20px;
                    border-radius: 15px;
                    margin: 20px 0;
                }
                button {
                    background: #ff6b35;
                    border: none;
                    color: white;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                }
                pre {
                    background: rgba(0,0,0,0.3);
                    padding: 10px;
                    border-radius: 8px;
                    overflow-x: auto;
                }
            </style>
        </head>
        <body>
            <h1>🧠 IA UTILITIES - Brainrot Manager</h1>
            <div class="card">
                <h2>📡 API Online!</h2>
                <p>Endpoint: POST /api/brainrot</p>
                <button onclick="testarEmbed()">🎯 Testar Embed</button>
                <div id="resultado"></div>
            </div>
            <div class="card">
                <h2>📋 Exemplo de Payload para o Roblox:</h2>
                <pre>{
    "nome": "Spyder Elephant",
    "valor": "79.0B",
    "valor_raw": 79000000000,
    "mutacao": "Default",
    "job_id": "a1b2c3d4-...",
    "players": 5,
    "outros": [
        {"nome": "Strawberry Elephant", "valor": "12.8B", "valor_raw": 12800000000}
    ]
}</pre>
            </div>
            <script>
                async function testarEmbed() {
                    const res = await fetch('/api/teste');
                    const data = await res.json();
                    document.getElementById('resultado').innerHTML = '<p>✅ ' + data.message + '</p>';
                }
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
    console.log('🧠 IA UTILITIES API RODANDO');
    console.log('='.repeat(50));
    console.log(`🚀 Local: http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log('='.repeat(50));
});
