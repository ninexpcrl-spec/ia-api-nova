const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let dados = [];

app.post('/api/brainrot', (req, res) => {
    console.log("📡 HEADERS:", req.headers);
    console.log("📡 BODY RECEBIDO:", req.body);
    
    // Aceita tanto { data: {...} } quanto direto {...}
    let info = req.body;
    if (req.body.data) {
        info = req.body.data;
    }
    
    const item = {
        job_id: info.job_id || "desconhecido",
        place_id: info.place_id,
        players: info.players,
        tipo: info.tipo,
        timestamp: info.timestamp,
        recebido_em: new Date().toISOString()
    };
    
    dados.push(item);
    console.log(`✅ Job ID salva: ${item.job_id}`);
    console.log(`📊 Total de dados: ${dados.length}`);
    
    res.json({
        success: true,
        total: dados.length,
        ultimo: item
    });
});

app.get('/api/dados', (req, res) => {
    res.json(dados);
});

app.get('/', (req, res) => {
    res.json({
        status: "online",
        total: dados.length,
        ultimos: dados.slice(-5)
    });
});

app.listen(PORT, () => {
    console.log(`✅ API rodando na porta ${PORT}`);
});
