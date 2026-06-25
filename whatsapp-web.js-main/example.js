const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('./index');
const { Ollama } = require('ollama');
const fs = require('fs');
const path = require('path');

const ollama = new Ollama({
    host: 'http://127.0.0.1:11434',
});

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'aysla-bot',
        dataPath: './.wwebjs_auth',
    }),
    puppeteer: {
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-infobars',
        ],
    },
});

client.on('loading_screen', (percent, message) => {
    console.log('Carregando WhatsApp:', percent, message);
});
//eventos de autenticação e conexão
client.on('qr', (qr) => {
    console.log('QR gerado com sucesso:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Aysla conectada com sucesso.');
});

client.on('auth_failure', (msg) => {
    console.error('Falha na autenticação:', msg);
});

client.on('disconnected', (reason) => {
    console.log('Desconectado:', reason);
});

client.on('change_state', (state) => {
    console.log('Estado do cliente:', state);
});
const MODEL_NAME = 'phi';

const BOT_INFO = {
    nome: 'Aysla',
    criador: 'Júniordev',
    versao: '2.0.0',
};

const BOT_CONFIG = {
    idiomaPadrao: 'pt-BR',
    maxHistorico: 12,
    mostrarMensagemPensando: true,
    tamanhoMaximoResposta: 1400,
    temperatura: 0.5,
    maxTokens: 220,
};

const DATA_DIR = path.join(__dirname, 'aysla_data');
const MEMORY_FILE = path.join(DATA_DIR, 'memoria.json');

function garantirEstruturaArquivos() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(MEMORY_FILE)) {
        fs.writeFileSync(
            MEMORY_FILE,
            JSON.stringify(
                {
                    usuarios: {},
                },
                null,
                2,
            ),
            'utf-8',
        );
    }
}

function carregarMemoria() {
    try {
        garantirEstruturaArquivos();
        const raw = fs.readFileSync(MEMORY_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch (error) {
        console.error('Erro ao carregar memória:', error);
        return { usuarios: {} };
    }
}

function salvarMemoria(db) {
    try {
        garantirEstruturaArquivos();
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(db, null, 2), 'utf-8');
    } catch (error) {
        console.error('Erro ao salvar memória:', error);
    }
}

let bancoMemoria = carregarMemoria();

function criarEstruturaUsuario() {
    return {
        historico: [
            {
                role: 'system',
                content: criarPromptSistema([]),
            },
        ],
        memoria: {
            notas: [],
            nomeInformado: null,
            preferencias: [],
            ultimoAssunto: null,
        },
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
    };
}

function obterUsuario(userId) {
    if (!bancoMemoria.usuarios[userId]) {
        bancoMemoria.usuarios[userId] = criarEstruturaUsuario();
        salvarMemoria(bancoMemoria);
    }

    return bancoMemoria.usuarios[userId];
}

function atualizarUsuario(userId, dados) {
    bancoMemoria.usuarios[userId] = dados;
    bancoMemoria.usuarios[userId].atualizadoEm = new Date().toISOString();
    salvarMemoria(bancoMemoria);
}

function criarPromptSistema(memorias = []) {
    let contextoMemoria = '';

    if (memorias.length > 0) {
        contextoMemoria =
            '\n\nMemórias salvas do usuário:\n' +
            memorias.map((item, index) => `${index + 1}. ${item}`).join('\n');
    }

    return `Você é ${BOT_INFO.nome}, uma assistente virtual profissional criada por ${BOT_INFO.criador}.
Responda sempre em português do Brasil.
Seu tom deve ser claro, educado, útil, direto e inteligente.
Você ajuda principalmente com:
- tecnologia
- programação
- dúvidas do dia a dia
- organização de ideias
- explicações técnicas
- criação e melhoria de código

Regras importantes:
- Nunca responda em inglês ou outro idioma.
- Sempre mantenha uma linguagem natural e profissional.
- Se o usuário pedir código, entregue código limpo, organizado e comentado.
- Se o usuário pedir explicação, explique de forma didática.
- Se não souber algo, diga com honestidade.
- Quando perguntarem quem é você, responda que seu nome é ${BOT_INFO.nome} e que você foi criada por ${BOT_INFO.criador}.
- Use o contexto de memória do usuário quando for relevante.${contextoMemoria}`;
}

function normalizarTexto(texto = '') {
    return texto.trim().replace(/\s+/g, ' ');
}

function dividirMensagem(texto, limite = BOT_CONFIG.tamanhoMaximoResposta) {
    if (!texto || texto.length <= limite) return [texto];

    const partes = [];
    let restante = texto;

    while (restante.length > limite) {
        let corte = restante.lastIndexOf('\n', limite);

        if (corte === -1 || corte < limite * 0.5) {
            corte = restante.lastIndexOf(' ', limite);
        }

        if (corte === -1 || corte < limite * 0.5) {
            corte = limite;
        }

        partes.push(restante.slice(0, corte).trim());
        restante = restante.slice(corte).trim();
    }

    if (restante.length > 0) {
        partes.push(restante);
    }

    return partes;
}

function limparComandoIA(texto) {
    return texto.replace(/^!ia\s*/i, '').trim();
}

function ehComandoIA(texto) {
    return /^!ia\b/i.test(texto);
}

function adicionarMemoriaManual(userId, nota) {
    const usuario = obterUsuario(userId);

    if (!usuario.memoria.notas.includes(nota)) {
        usuario.memoria.notas.push(nota);
    }

    usuario.historico[0] = {
        role: 'system',
        content: criarPromptSistema(usuario.memoria.notas),
    };

    atualizarUsuario(userId, usuario);
}

function listarMemorias(userId) {
    const usuario = obterUsuario(userId);
    return usuario.memoria.notas || [];
}

function limparMemoriaUsuario(userId) {
    const usuario = obterUsuario(userId);

    usuario.historico = [
        {
            role: 'system',
            content: criarPromptSistema([]),
        },
    ];

    usuario.memoria = {
        notas: [],
        nomeInformado: null,
        preferencias: [],
        ultimoAssunto: null,
    };

    atualizarUsuario(userId, usuario);
}

function atualizarMemoriaAutomatica(userId, mensagemUsuario) {
    const usuario = obterUsuario(userId);
    const texto = mensagemUsuario.toLowerCase();

    usuario.memoria.ultimoAssunto = mensagemUsuario.slice(0, 120);

    const regexNome = /meu nome é\s+([a-zà-úA-ZÀ-Ú\s]+)/i;
    const matchNome = mensagemUsuario.match(regexNome);

    if (matchNome && matchNome[1]) {
        usuario.memoria.nomeInformado = matchNome[1].trim();
        const notaNome = `O nome do usuário é ${usuario.memoria.nomeInformado}.`;

        if (!usuario.memoria.notas.includes(notaNome)) {
            usuario.memoria.notas.push(notaNome);
        }
    }

    const gatilhosPreferencia = [
        'eu gosto de',
        'eu prefiro',
        'quero aprender',
        'tenho interesse em',
        'trabalho com',
        'estudo',
    ];

    for (const gatilho of gatilhosPreferencia) {
        if (texto.includes(gatilho)) {
            const nota = `Preferência/interesse informado pelo usuário: ${mensagemUsuario}`;
            if (!usuario.memoria.notas.includes(nota)) {
                usuario.memoria.notas.push(nota);
            }
            break;
        }
    }

    usuario.historico[0] = {
        role: 'system',
        content: criarPromptSistema(usuario.memoria.notas),
    };

    atualizarUsuario(userId, usuario);
}

async function responderEmPartes(msg, texto) {
    const partes = dividirMensagem(texto);

    for (const parte of partes) {
        if (parte && parte.trim()) {
            await msg.reply(parte);
        }
    }
}

function montarMenu() {
    return `🤖 *${BOT_INFO.nome} - Menu de Comandos*

💬 *Comandos principais*
!ia sua pergunta
!apresentar
!menu
!status

🧠 *Memória*
!lembrar texto
!memoria
!reset

📌 *Exemplos*
!ia me explique o que é API
!ia melhore esse código em JavaScript
!lembrar Meu foco é front-end
!memoria

👨‍💻 Bot: ${BOT_INFO.nome}
🛠 Criado por: ${BOT_INFO.criador}
📦 Versão: ${BOT_INFO.versao}`;
}

function montarApresentacao() {
    return `Olá, me chamo *${BOT_INFO.nome}* 🤖

Sou uma IA criada por *${BOT_INFO.criador}* para ajudar com:
- programação
- tecnologia
- dúvidas técnicas
- organização de ideias
- melhoria de código

🧠 Agora eu também tenho *memória persistente*.
Isso significa que posso guardar informações importantes que você mandar, como preferências, foco de estudo e contexto das conversas.

📌 *Comandos disponíveis*
!ia sua pergunta
!menu
!status
!lembrar texto
!memoria
!reset

Exemplo:
!lembrar Meu foco é desenvolvimento front-end

Depois disso, posso usar essa informação para te responder melhor nas próximas conversas.`;
}

function montarStatus(userId) {
    const usuario = obterUsuario(userId);
    const totalMemorias = usuario.memoria.notas.length;
    const totalMensagens = usuario.historico.length - 1;

    return `📊 *Status da ${BOT_INFO.nome}*

🤖 Nome: ${BOT_INFO.nome}
👨‍💻 Criador: ${BOT_INFO.criador}
📦 Versão: ${BOT_INFO.versao}
🧠 Memórias salvas: ${totalMemorias}
💬 Itens no histórico atual: ${totalMensagens}
🌎 Idioma: Português do Brasil
🟢 Modelo: ${MODEL_NAME}`;
}

async function gerarRespostaIA(userId, pergunta) {
    const usuario = obterUsuario(userId);

    usuario.historico[0] = {
        role: 'system',
        content: criarPromptSistema(usuario.memoria.notas),
    };

    usuario.historico.push({
        role: 'user',
        content: pergunta,
    });

    if (usuario.historico.length > BOT_CONFIG.maxHistorico) {
        const systemMsg = usuario.historico[0];
        const ultimasMensagens = usuario.historico.slice(
            -(BOT_CONFIG.maxHistorico - 1),
        );
        usuario.historico = [systemMsg, ...ultimasMensagens];
    }

    atualizarUsuario(userId, usuario);

    const response = await ollama.chat({
        model: MODEL_NAME,
        messages: usuario.historico,
        stream: false,
        options: {
            temperature: BOT_CONFIG.temperatura,
            num_predict: BOT_CONFIG.maxTokens,
        },
    });

    const resposta =
        response && response.message && response.message.content
            ? response.message.content.trim()
            : 'Não consegui gerar uma resposta agora.';

    usuario.historico.push({
        role: 'assistant',
        content: resposta,
    });

    if (usuario.historico.length > BOT_CONFIG.maxHistorico) {
        const systemMsg = usuario.historico[0];
        const ultimasMensagens = usuario.historico.slice(
            -(BOT_CONFIG.maxHistorico - 1),
        );
        usuario.historico = [systemMsg, ...ultimasMensagens];
    }

    atualizarUsuario(userId, usuario);

    return resposta;
}

client.on('qr', (qr) => {
    console.log('QR RECEIVED:', qr);
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
});

client.on('auth_failure', (msg) => {
    console.error('AUTHENTICATION FAILURE:', msg);
});

client.on('ready', async () => {
    console.log(`✅ ${BOT_INFO.nome} pronta com Ollama!`);
    console.log(`👨‍💻 Criada por: ${BOT_INFO.criador}`);
});

client.on('message', async (msg) => {
    try {
        const textoOriginal = msg.body ? normalizarTexto(msg.body) : '';

        if (!textoOriginal) return;
        if (msg.fromMe) return;

        const userId = msg.from;
        const textoLower = textoOriginal.toLowerCase();

        if (textoLower === '!menu') {
            await msg.reply(montarMenu());
            return;
        }

        if (textoLower === '!apresentar') {
            await msg.reply(montarApresentacao());
            return;
        }

        if (textoLower === '!status') {
            await msg.reply(montarStatus(userId));
            return;
        }

        if (textoLower === '!reset') {
            limparMemoriaUsuario(userId);
            await msg.reply(
                '🧹 Histórico e memória da Aysla foram apagados com sucesso.',
            );
            return;
        }

        if (textoLower === '!memoria') {
            const memorias = listarMemorias(userId);

            if (!memorias.length) {
                await msg.reply('🧠 Nenhuma memória salva até agora.');
                return;
            }

            const resposta = `🧠 *Memórias salvas da Aysla*\n\n${memorias
                .map((item, index) => `${index + 1}. ${item}`)
                .join('\n')}`;

            await responderEmPartes(msg, resposta);
            return;
        }

        if (textoLower.startsWith('!lembrar ')) {
            const conteudo = textoOriginal.replace(/^!lembrar\s+/i, '').trim();

            if (!conteudo) {
                await msg.reply('Use assim: !lembrar seu texto aqui');
                return;
            }

            adicionarMemoriaManual(userId, conteudo);
            await msg.reply(
                `🧠 Informação salva com sucesso na memória da ${BOT_INFO.nome}.`,
            );
            return;
        }

        if (!ehComandoIA(textoOriginal)) return;

        const pergunta = limparComandoIA(textoOriginal);

        if (!pergunta) {
            await msg.reply('Use assim: !ia sua pergunta');
            return;
        }

        atualizarMemoriaAutomatica(userId, pergunta);

        if (BOT_CONFIG.mostrarMensagemPensando) {
            await msg.reply('🤖 Aysla está pensando...');
        }

        const respostaIA = await gerarRespostaIA(userId, pergunta);
        await responderEmPartes(msg, respostaIA);
    } catch (error) {
        console.error(`Erro na ${BOT_INFO.nome}:`, error);

        await msg.reply(
            `❌ Ocorreu um erro ao consultar a ${BOT_INFO.nome}. Verifique se o Ollama está aberto e se o modelo "${MODEL_NAME}" está instalado.`,
        );
    }
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out:', reason);
});

client.on('loading_screen', (percent, message) => {
    console.log('Carregando WhatsApp:', percent, message);
});

garantirEstruturaArquivos();
client.initialize();
