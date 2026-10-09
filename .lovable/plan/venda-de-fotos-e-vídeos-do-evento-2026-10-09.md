# Venda de fotos e vídeos do evento

Decisões: reconhecimento facial no aparelho, marca d'água sobre o player para vídeos, divisão automática no Asaas, parte dos fotógrafos proporcional às fotos vendidas.

## Fase 1 — Base e cadastro
- **Cadastro de fotógrafo** (Minha conta → Sou fotógrafo): nome, CPF/CNPJ, telefone, carteira Asaas (walletId), dados bancários. Super admin aprova.
- **Super admin → Fotos**: criar "álbum de fotos" escolhendo um evento existente; definir:
  - comissão do dono do evento %, comissão da plataforma %, comissão dos fotógrafos % (soma 100%)
  - preço por foto e por vídeo
  - descontos progressivos (ex.: 5+ fotos = R$ X cada, 10+ = R$ Y)
  - pacotes: todas as fotos, todos os vídeos, tudo (fotos + vídeos)
  - convidar fotógrafos pelo e-mail/CPF
  - enviar a marca d'água em PNG (uma para foto, uma para vídeo)
  - opção "dono do evento vê o faturamento total" (sem nome de fotógrafo nem foto)

## Fase 2 — Upload do fotógrafo
- Página **Meus álbuns**: aceita o convite, escolhe Fotos ou Vídeos e envia em lote (centenas por vez, com barra de progresso).
- No envio, o próprio navegador detecta os rostos e salva a "assinatura" de cada um; gera a prévia reduzida com marca d'água para fotos. O original fica em área privada.
- Vídeos: original privado + prévia curta exibida com a marca sobre o player.

## Fase 3 — Galeria do cliente e compra
- Menu e seção **Fotos** na página inicial com os álbuns ativos.
- Página do álbum: cliente tira uma selfie (ou envia uma foto) → mostra as fotos onde ele aparece; também pode navegar por tudo.
- Carrinho com preço progressivo aplicado automaticamente, pacotes, cupom, pagamento Pix/cartão pelo Asaas com divisão automática para fotógrafo(s) e dono do evento.
- Após pagamento: **Minha conta → Minhas fotos** com download dos originais sem marca d'água (links temporários seguros).

## Fase 4 — Painéis de ganhos e pedidos
- **Super admin**: faturamento por álbum, fotos/vídeos vendidos, ticket médio, ranking de fotógrafos (como na imagem enviada), ganhos de cada parte, histórico.
- **Pedidos de fotos**: lista com cliente (nome, e-mail, CPF, telefone), itens, status e links das fotos.
- **Fotógrafo**: só os próprios ganhos e vendas.
- **Dono do evento**: a própria comissão; total do evento só se o super admin liberar.

## Detalhes técnicos
- Tabelas novas: photographers, photo_albums (event_id, comissões, preços, pacotes, marcas d'água, flag de visibilidade), album_photographers (convite/aceite), media_items (tipo, original privado, prévia, fotógrafo), media_faces (vetor 128d com pgvector + índice), price_tiers, photo_orders, photo_order_items, photo_deliveries.
- Rostos: face-api.js (modelos carregados no navegador) no upload e na selfie; busca por similaridade no banco (distância de cosseno), limiar ajustável.
- Split: cada cobrança Asaas leva split com walletId do dono do evento e de cada fotógrafo, proporcional aos itens; plataforma fica com o restante. Webhook existente reconhece prefixo `photo_`.
- Downloads: URLs assinadas de curta duração geradas no servidor somente para pedidos pagos do próprio cliente.
- Armazenamento: buckets privados `media-originals` e `media-previews`; 10 mil fotos por evento consomem espaço — prévias comprimidas (~150 KB).

Entregarei fase a fase, com cada fase funcionando antes da próxima. Envie os PNGs da marca d'água quando a Fase 1 estiver pronta.
