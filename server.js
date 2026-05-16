const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let dados = [];

app.post('/api/brainrot', (req, res) => {
    console.log("📡 Recebido:", req.body);
    
    const item = {
        ...req.body,
        recebido: new Date().toISOString()
    };
    
    dados.push(item);
    
    res.json({
        success: true,
        total: dados.length
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