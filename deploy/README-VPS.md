# Levar o Evenon para a sua VPS (aaPanel) — site e banco

Este é o roteiro completo. A máquina (16 GB de memória, 2 TB de disco) dá conta
com folga. Vá em ordem e me avise ao terminar cada etapa — eu confiro e sigo.

O que fica na VPS: o site, o banco de dados (com os logins), as fotos/vídeos
(MinIO, já instalado) e os disparos automáticos de e-mail.

Arquivos que já estão no repositório para ajudar:

| Arquivo | Para que serve |
|---|---|
| `vite.config.vps.ts` | Build do site para Node (não mexe no build do Lovable) |
| `deploy/deploy.sh` | Atualiza o site: puxa do GitHub, instala, gera o build, recarrega |
| `deploy/ecosystem.config.cjs` | Mantém o site rodando 24h (PM2) |
| `deploy/nginx.evenon.conf` | Endereços e SSL do site |
| `deploy/nginx.banco.conf` | Endereços e SSL do banco |
| `deploy/supabase/setup-supabase.sh` | Instala o banco novo em Docker |
| `deploy/migrate-db.sh` | Cria as tabelas no banco novo |
| `deploy/import-data.sh` | Carrega os dados exportados |
| `deploy/.env.production.example` | Lista as chaves que o servidor precisa |

---

## Etapa 1 — Código no GitHub

1. No editor, clique no **+** (embaixo à esquerda, na caixa de mensagem) → **GitHub** → **Connect project**.
2. Autorize, escolha a sua conta e clique em **Create Repository**.
3. Me avise — eu confirmo que o repositório está com o código inteiro (inclusive as pastas `deploy/` e `drizzle/`).

## Etapa 2 — Preparar o aaPanel

Em **App Store**, instale: **Docker Manager**, **Node.js Manager** (versão 22) e **PM2 Manager**.
Depois, no terminal do aaPanel (ou SSH):

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version
```

## Etapa 3 — Banco novo em Docker

```bash
sudo bash deploy/supabase/setup-supabase.sh https://evenon.com.br /opt/supabase
```

O script baixa o pacote oficial de auto-hospedagem, gera chaves novas e sobe os
containers. Guarde o `DASHBOARD_PASSWORD` que aparecer (é o painel do banco).

Endereços internos: API `http://127.0.0.1:8000`, painel `http://127.0.0.1:8081`.

## Etapa 4 — Tabelas no banco novo

Pegue a senha do banco no arquivo `/opt/supabase/.env` (linha `POSTGRES_PASSWORD`):

```bash
cd /www/wwwroot/evenon.com.br
DATABASE_URL="postgres://postgres:SENHA@127.0.0.1:5432/postgres" bash deploy/migrate-db.sh
```

Isso cria as 29 etapas de tabelas, funções, permissões e automações.

## Etapa 5 — Copiar os dados atuais

O banco atual (Lovable Cloud) tem inscrição, produtor, pedido, cupom,
configuração e histórico. A exportação é feita pela tela **Cloud → Advanced
settings → Export data**, e eu trago as tabelas que a exportação não cobrir,
tabela por tabela, em arquivo `.csv`.

Depois, na VPS:

```bash
DATABASE_URL="postgres://postgres:SENHA@127.0.0.1:5432/postgres" bash deploy/import-data.sh /caminho/dos/csv
```

**Não desconecte o Cloud ainda** — a desconexão apaga o banco atual de vez e não
tem volta. Só se fala disso quando a VPS estiver testada.

## Etapa 6 — Logins dos atletas

A senha de cada pessoa **não é transferível** (fica guardada de forma criptografada
pelo serviço atual). Então, no banco novo, cada conta é recriada com o mesmo
número e o mesmo e-mail, e a pessoa define a senha de novo por
**"Esqueci minha senha"** — ou recebe um convite por e-mail.
Quem entra pelo Google entra direto, sem precisar de senha.

## Etapa 7 — Subir o site

```bash
git clone git@github.com:SEU_USUARIO/SEU_REPO.git /www/wwwroot/evenon.com.br
cd /www/wwwroot/evenon.com.br
cp deploy/.env.production.example .env.production
echo .env.production >> .git/info/exclude   # deixa o arquivo fora do Git
nano .env.production                        # preencha as chaves
bash deploy/deploy.sh
pm2 logs evenon                             # confira se subiu sem erro
```

## Etapa 8 — Proxy e SSL

- Site: **Sites → evenon.com.br → Configuração** → cole `deploy/nginx.evenon.conf` dentro do `server { }`.
- Banco: crie o site **banco.evenon.com.br** com SSL e cole `deploy/nginx.banco.conf`.
- No firewall do aaPanel, deixe a porta 8081 (painel do banco) só para o seu IP.

## Etapa 9 — Asaas, Google e e-mails

- **Asaas**: confirme o webhook em `https://evenon.com.br/webhook/asaas` com o
  mesmo token salvo em Super admin → Configurações (ele viaja junto com o banco).
- **Google**: no banco novo, configure o Google com as suas próprias credenciais
  (assim a tela de acesso sai só com a marca Evenon, sem nada do Lovable).
- **E-mails**: os avisos de pagamento, comprovante e fotos continuam saindo pelo
  `LOVABLE_API_KEY`. Os e-mails de login (confirmação e "esqueci minha senha")
  passam a sair do banco novo — para isso configure um SMTP da Hostinger no
  arquivo `/opt/supabase/.env` (GoTrue) e reinicie o container `auth`.

## Etapa 10 — Testar e cortar

Antes de mudar o DNS, teste a VPS direto no navegador (aponte o arquivo `hosts`
do seu computador ou use o IP com o proxy já configurado):

- [ ] Entrar, ver evento, inscrever, pagar Pix de verdade e ver o pedido confirmado
- [ ] Webhook Asaas marcando pago (olhe `pm2 logs evenon`)
- [ ] QR code do comprovante, entrega de kit e área do atleta
- [ ] Fotos: galeria, compra, busca por rosto e envio ao cliente
- [ ] Painel do produtor, saque e painel do super admin
- [ ] Automações rodando (cron a cada 5 min)

Só então aponte o DNS de `evenon.com.br` para a VPS. Deixe o site atual no ar
por uns dias, para poder voltar se algo aparecer.

---

## Avisos honestos

1. **É a parte mais trabalhosa do processo.** O banco é o coração do sistema;
   errar aqui perde dados. Por isso as etapas 4, 5 e 6 são conferidas com calma.
2. **E-mail de login** precisa de SMTP próprio na VPS (Hostinger serve). Sem
   isso, ninguém recupera senha.
3. **Backup** passa a ser responsabilidade sua: disco de 2 TB é mais que
   suficiente, mas rode uma cópia diária do banco e uma semanal das fotos.
4. **Custo de manutenção**: você vira o administrador do servidor. Atualizações
   de segurança do Docker e renovação de SSL ficam com você.
