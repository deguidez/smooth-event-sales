import * as React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  kind?: 'inscricao_criada' | 'pagamento_confirmado' | 'pagamento_vencido' | 'inscricao_cancelada' | 'checkout_abandonado' | 'lembrete_evento' | 'fotos_encontradas' | 'fotos_pedido_criado' | 'fotos_nao_pagas' | 'fotos_pagas'
  name?: string
  eventTitle?: string
  code?: string
  total?: string
  url?: string
  downloads?: { label: string; url: string }[]
}

const copy = {
  inscricao_criada: { title: 'Inscrição recebida', text: 'Recebemos sua inscrição. Se ainda não pagou, finalize o pagamento para garantir sua vaga.', cta: 'Ver inscrição e pagar' },
  pagamento_confirmado: { title: 'Inscrição confirmada!', text: 'Seu pagamento foi confirmado. Seu comprovante e o QR code estão disponíveis no link abaixo.', cta: 'Ver comprovante' },
  inscricao_cancelada: { title: 'Sua inscrição foi cancelada', text: 'Não identificamos o pagamento no prazo, então a inscrição foi cancelada e a vaga liberada. Ainda dá tempo: faça uma nova inscrição enquanto houver vagas.', cta: 'Inscrever-me novamente' },
  checkout_abandonado: { title: 'Falta pouco para garantir sua vaga', text: 'Você começou sua inscrição mas não finalizou. As vagas são limitadas — conclua agora.', cta: 'Finalizar inscrição' },
  lembrete_evento: { title: 'Seu evento está chegando!', text: 'Faltam poucos dias. Leve o comprovante de inscrição (com QR code) para a retirada do kit.', cta: 'Ver comprovante de retirada' },
  fotos_encontradas: { title: 'Encontramos suas fotos!', text: 'Você buscou suas fotos e encontramos você no álbum do evento. Elas estão esperando por você — garanta as suas antes que acabe o prazo.', cta: 'Ver minhas fotos' },
  fotos_pedido_criado: { title: 'Pedido de fotos recebido', text: 'Recebemos seu pedido de fotos. Finalize o pagamento para liberar os arquivos em alta qualidade, sem marca d’água.', cta: 'Pagar meu pedido' },
  fotos_nao_pagas: { title: 'Seu pedido de fotos ainda não foi pago', text: 'Notamos que o pagamento das suas fotos ainda não foi concluído. Pague agora para liberar os arquivos.', cta: 'Concluir pagamento' },
  fotos_pagas: { title: 'Suas fotos estão liberadas!', text: 'Pagamento confirmado. Suas fotos e vídeos em alta qualidade, sem marca d’água, ficam no link abaixo, organizados por evento, por 6 meses.', cta: 'Baixar minhas fotos' },
  pagamento_vencido: { title: 'Pagamento não identificado', text: 'O prazo de pagamento da sua inscrição venceu. Acesse para gerar um novo pagamento, se ainda houver vagas.', cta: 'Ver inscrição' },
}

function OrderStatusEmail({ kind = 'inscricao_criada', name = 'Atleta', eventTitle = 'seu evento', code = '', total = '', url = 'https://evenon.com.br', downloads = [] }: Props) {
  const c = copy[kind] ?? copy.inscricao_criada
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{c.title} — {eventTitle}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Manrope, Arial, sans-serif' }}>
        <Container style={{ padding: '24px', maxWidth: '560px' }}>
          <Heading style={{ color: '#1a1a1a', fontSize: '24px' }}>{c.title}</Heading>
          <Text style={{ color: '#333', fontSize: '15px' }}>Olá, {name}!</Text>
          <Text style={{ color: '#333', fontSize: '15px' }}>{c.text}</Text>
          <Text style={{ color: '#333', fontSize: '15px' }}>
            <b>Evento:</b> {eventTitle}<br />
            {code && <><b>Código:</b> {code}<br /></>}
            {total && <><b>Valor:</b> {total}</>}
          </Text>
          {downloads.length > 0 && (
            <>
              <Text style={{ color: '#333', fontSize: '15px' }}><b>Baixe seus arquivos (links válidos por 7 dias):</b></Text>
              {downloads.map((d) => (
                <Text key={d.url} style={{ margin: '4px 0' }}>
                  <a href={d.url} style={{ color: '#f97316', fontWeight: 700 }}>{d.label}</a>
                </Text>
              ))}
            </>
          )}
          <Button href={url} style={{ backgroundColor: '#f97316', color: '#ffffff', padding: '12px 20px', borderRadius: '8px', fontWeight: 700 }}>{c.cta}</Button>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: OrderStatusEmail,
  subject: (d) => `${(copy as any)[d['kind']]?.title ?? 'Sua inscrição'} — ${d['eventTitle'] ?? 'Inscreva'}`,
  displayName: 'Status da inscrição',
  previewData: { kind: 'pagamento_confirmado', name: 'Maria', eventTitle: 'Open de Jiu-Jitsu', code: '55B7E3C5', total: 'R$ 80,00' },
} satisfies TemplateEntry
