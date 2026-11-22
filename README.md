# Escala de Cultos — IASD

Aplicativo web simples para montar a escala dos cultos de **quarta, sábado e domingo** da Igreja Adventista do Sétimo Dia.

O líder cadastra os membros e preenche, para cada culto:

- 🎤 **Pregação**
- 🎧 **Sonoplastia**
- 🎶 **Louvor Congregacional**
- 🎵 **Louvor Especial**
- 🧒 **Adoração Infantil**, 🤝 **Diáconos**, 🤝 **Diaconisas** e 👋 **Recepção** (cultos de sábado)
  - Diáconos e Diaconisas aceitam **quantas pessoas o líder quiser** (botão **+ Adicionar**). Em Configurações → Funções, a opção **Vários nomes** pode ser ligada para qualquer outra função.
- 📖 Tema / observação (opcional)

## Programações padrão

| Dia | Programação | Horário |
|---|---|---|
| Quarta | Culto de Oração | 19:30 |
| Sábado | Escola Sabatina *(desativada por padrão)* | 09:00 |
| Sábado | Culto Divino | 10:30 |
| Sábado | Culto Jovem (JA) | 17:00 |
| Domingo | Culto de Evangelismo | 19:00 |

Tudo pode ser alterado na aba **Configurações**: nomes, horários, dias, funções de cada culto e novas funções (Recepção, Diaconato, Oração etc.).

## Login e perfis

No **primeiro acesso** o sistema pede para criar o usuário **Administrador**. Na aba **Usuários**, o administrador cria os líderes e marca quais campos cada um preenche.

| Perfil | Acesso |
|---|---|
| **Administrador** | Escala, Membros, Visualizar / Enviar, Configurações e Usuários (cria líderes, muda perfis, redefine senhas, limpa o mês) |
| **Líder** | **Escala** — vê e preenche **somente os campos atribuídos a ele** (ex.: só Sonoplastia) · **Visualizar / Enviar** — vê a escala completa |

Todos podem trocar a própria senha no botão **Minha senha**. As senhas são guardadas criptografadas (SHA-256 com salt).

> ⚠️ Como o app roda só no navegador (sem servidor), o login organiza o acesso, mas não é uma proteção forte: quem tem o aparelho e conhecimento técnico consegue ler os dados. Os usuários existem apenas no navegador onde foram criados — use um aparelho compartilhado (ex.: computador da secretaria) ou evolua para um banco de dados online.

## Recursos

- Escala mensal gerada automaticamente com todas as quartas, sábados e domingos
- Cadastro de membros com as funções que cada um pode exercer
- **Rodízio automático**: preenche as vagas vazias distribuindo de forma equilibrada
- Contagem de quantas vezes cada membro foi escalado no mês
- **Imprimir / salvar em PDF**
- **Copiar para o WhatsApp** (texto formatado pronto para o grupo da igreja)
- Exportar / importar backup em `.json`
- Funciona no celular e no computador, sem instalar nada

> Os dados ficam salvos **no navegador** de quem usa (localStorage). Para levar para outro aparelho, use **Exportar** e **Importar** na aba Configurações.

## Avisos aos escalados (WhatsApp)

Aba **Avisos** (administrador e líderes — cada líder vê só as suas funções):

- Lista quem está escalado nos próximos dias; o botão **Enviar** abre o WhatsApp já com o número da pessoa e a mensagem pronta (dia, horário, culto, função e o contato do líder responsável caso ela não possa ir). Marca "✓ enviado".

Cadastre o WhatsApp (com DDD) dos membros em **Membros** e dos líderes em **Usuários** — o líder responsável por cada função é quem recebe o "não posso ir".

## Como publicar no GitHub Pages

1. Crie uma conta em [github.com](https://github.com) (se ainda não tiver).
2. Clique em **New repository**, dê o nome `escala-cultos`, deixe **Public** e crie.
3. Clique em **uploading an existing file** e envie os arquivos `index.html` e `README.md`. Clique em **Commit changes**.
4. Vá em **Settings → Pages**. Em *Source*, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** e clique em **Save**.
5. Em 1–2 minutos o app estará em:
   `https://SEU-USUARIO.github.io/escala-cultos/`

## Licença

MIT — livre para usar e adaptar em sua igreja.
