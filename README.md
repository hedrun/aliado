# ALIADO — INVINCIBLE 🦸

Versão multiplayer online do jogo **Aliado** (também conhecido como Pitoco), com tema da HQ Invincible!

## Como Jogar

- Cada jogador acessa do próprio celular
- Um jogador cria a sala e compartilha o código
- Todos jogam de onde estiverem
- Modo **todos contra todos** com sistema de alianças!

### Regras
- Para sair do paiol: tire 6 em um dos dados, ou dupla (1+1 ou 6+6)
- Dupla ou 18 (1+2) = joga de novo
- Primeiro a sair ganha bônus de saída
- Quadrados com caveira = volte pro paiol
- Pitoco = empilhe suas pedras para protegê-las
- Alianças = proponha, aceite ou traia quando quiser!

---

## Instalação e Deploy

### Pré-requisitos
- Node.js 18+
- npm

### Rodar localmente
```bash
npm install
npm start
# Acesse: http://localhost:3000
```

### Deploy no Railway (recomendado — GRÁTIS)
1. Crie conta em https://railway.app
2. Crie novo projeto → "Deploy from GitHub repo"
3. Faça upload deste código ou conecte ao GitHub
4. Railway detecta automaticamente Node.js
5. Pronto! Você recebe uma URL pública

### Deploy no Render (alternativa grátis)
1. Crie conta em https://render.com
2. New → Web Service
3. Conecte seu repositório
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Free tier funciona bem!

### Deploy no Fly.io
```bash
npm install -g flyctl
flyctl launch
flyctl deploy
```

### Variáveis de Ambiente
- `PORT` — porta do servidor (padrão: 3000, definido automaticamente pelos serviços de cloud)

---

## Estrutura do Projeto
```
aliado-invincible/
├── server.js           # Servidor Express + Socket.io
├── src/
│   └── gameLogic.js    # Lógica do jogo
├── public/
│   ├── index.html      # Interface principal
│   ├── css/style.css   # Tema Invincible
│   └── js/
│       ├── board.js    # Renderização do tabuleiro (Canvas)
│       └── game.js     # Lógica do cliente
└── package.json
```

---

"Eu pensei que você seria diferente." — Omni-Man
