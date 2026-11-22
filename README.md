# Escala de Cultos — IASD

Aplicativo web para montar a escala dos cultos de **quarta, sábado e domingo** da Igreja Adventista do Sétimo Dia. Os dados ficam **na nuvem (Firebase, do Google)**: todos os líderes veem e preenchem a mesma escala, cada um no seu celular ou computador, em tempo real.

Para cada culto, o app tem os campos:

- 🎤 **Pregação**
- 🎧 **Sonoplastia**
- 🎶 **Louvor Congregacional**
- 🎵 **Louvor Especial**
- 🧒 **Adoração Infantil**, 🤝 **Diáconos**, 🤝 **Diaconisas** e 👋 **Recepção** (cultos de sábado)
  - Diáconos e Diaconisas aceitam **quantas pessoas o líder quiser** (botão **+ Adicionar**). A opção **Vários nomes**, em Configurações → Funções, pode ser ligada para qualquer outra função.
- 📖 Tema / observação (opcional)

## Perfis

| Perfil | Acesso |
|---|---|
| **Administrador** | Tudo: Escala, Membros, Visualizar / Enviar, Avisos, Configurações e Usuários |
| **Líder** | **Escala**: vê e preenche **somente os campos atribuídos a ele** · **Visualizar / Enviar**: vê a escala completa · **Avisos**: avisa quem foi escalado nas funções dele |

O login é por **e-mail e senha**. A tela de entrada tem a opção "Esqueci minha senha", e quem já está dentro pode trocar a senha no botão **Minha senha**. As regras de segurança do Firebase garantem que um líder só consegue alterar os próprios campos, mesmo que tente burlar o app.

## Recursos

- Escala mensal com todas as quartas, sábados e domingos
- **Tempo real**: o que um líder preenche aparece na hora para os outros
- Cadastro de membros com o WhatsApp e as funções de cada um
- **Rodízio automático**, que preenche as vagas vazias de forma equilibrada
- **Imprimir / salvar em PDF** e **copiar para o WhatsApp**
- **Avisos**: com um clique, abre o WhatsApp com a mensagem pronta para a pessoa escalada, 5 dias antes (a antecedência pode ser ajustada). Se ela não puder ir, a mensagem traz o contato do líder responsável.
- Exportar / importar cópia de segurança (`.json`)

---

# Instalação (uma única vez)

São três etapas: **criar o projeto no Firebase**, **colar a configuração** e **publicar no GitHub Pages**. Leva uns 15 minutos.

## Etapa 1 — Criar o projeto no Firebase (grátis)

1. Acesse **console.firebase.google.com** com uma conta Google da igreja e clique em **Criar um projeto**. Dê um nome, por exemplo `escala-iasd`. O Google Analytics pode ficar **desativado**.
2. **Login por e-mail:** no menu, vá em **Criação → Authentication → Vamos começar → Método de login** e ative **E-mail/senha**. Clique em Salvar.
3. **Banco de dados:** vá em **Criação → Firestore Database → Criar banco de dados**.
   - Escolha a localização **southamerica-east1 (São Paulo)**.
   - Escolha **Iniciar no modo de produção**.
4. **Regras de segurança:** ainda no Firestore, abra a aba **Regras**. Apague o que estiver lá, cole todo o conteúdo do arquivo `firestore.rules` deste projeto e clique em **Publicar**.
5. **Registrar o app da Web:** em **⚙️ Configurações do projeto → Geral → Seus apps**, clique no ícone **`</>`** (Web), dê um apelido e clique em **Registrar app**. Não precisa marcar o Hosting. Aparece um bloco assim:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "escala-iasd.firebaseapp.com",
     projectId: "escala-iasd",
     storageBucket: "escala-iasd.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };
   ```
   Copie esse bloco.

## Etapa 2 — Colar a configuração

Abra o arquivo **`firebase-config.js`** e troque o bloco de exemplo pelo que você copiou. Mantenha o `export` no começo:

```js
export const firebaseConfig = {
  apiKey: "AIza...",
  ...
};
```

> Esses dados **não são senha** e podem ficar públicos no GitHub. Quem protege os dados são as regras da etapa 1.4.

## Etapa 3 — Publicar no GitHub Pages

1. No repositório do GitHub (público), envie **todos** os arquivos: `index.html`, `app.js`, `nuvem.js`, `firebase-config.js`, `firestore.rules`, `README.md` e `LICENSE`. Use **Add file → Upload files**. Os arquivos que já existem serão substituídos.
2. Em **Settings → Pages**: **Deploy from a branch → main → /(root) → Save**, se ainda não estiver ativo.
3. **Autorize o endereço do site no Firebase:** em **Authentication → Configurações → Domínios autorizados → Adicionar domínio**, informe `SEU-USUARIO.github.io` (sem `https://` e sem o nome do repositório).
4. Abra `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`. Aparece **"Primeiro acesso: crie o administrador do sistema"**: informe seu nome, e-mail e senha.

Pronto! Agora, na aba **Usuários**, cadastre os líderes com o **e-mail** de cada um, uma senha inicial e os campos que vão preencher. Depois, passe para cada líder o link do site, o e-mail e a senha inicial. Ele pode trocar a senha depois.

### Trazer os dados da versão anterior

Se você usava a versão antiga (que salvava no navegador), abra o novo site **no mesmo computador e navegador** e entre como administrador. Em **Configurações** aparece o quadro **"Dados da versão anterior"**: clique em **Enviar dados deste navegador para a nuvem**. Os usuários antigos não são levados; cadastre-os de novo com e-mail. Também dá para usar **Importar dados** com um arquivo exportado pela versão antiga.

---

## Perguntas comuns

- **Custa alguma coisa?** Não. O plano gratuito do Firebase (Spark) permite dezenas de milhares de leituras e gravações por dia, muito mais do que uma igreja usa. Não é preciso cadastrar cartão.
- **E se alguém esquecer a senha?** Na tela de entrada, use "Esqueci minha senha": chega um e-mail com o link para criar outra. O administrador também pode, na aba Usuários, clicar em **Enviar redefinição de senha**.
- **Como tirar o acesso de alguém?** Na aba Usuários, clique em **Excluir**. A pessoa é desconectada na hora e não entra mais. Para dar acesso de novo, cadastre o mesmo e-mail outra vez.
- **Funciona sem internet?** Precisa de internet para entrar e para carregar. Se a conexão cair no meio do preenchimento, o app guarda o que foi digitado e envia quando a internet voltar. O canto superior mostra "☁️ salvo" ou "⏳ salvando…".
- **Apareceu "Sem permissão para essa alteração"?** Confira se as regras do arquivo `firestore.rules` foram publicadas (etapa 1.4) e se o líder tem o campo marcado na aba Usuários.
- **Erro ao entrar, falando de domínio não autorizado?** Falta a etapa 3.3.

## Licença

MIT — livre para usar e adaptar em sua igreja. Inclui o Firebase JavaScript SDK (Apache 2.0) no arquivo `nuvem.js`.
