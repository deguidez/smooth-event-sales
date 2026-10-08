import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { name?: string; code?: string; amount?: string }

function WithdrawalCodeEmail({ name = 'Produtor', code = '000000', amount = '' }: Props) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>Seu código para confirmar o saque</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Manrope, Arial, sans-serif' }}>
        <Container style={{ padding: '24px', maxWidth: '560px' }}>
          <Heading style={{ color: '#1a1a1a', fontSize: '24px' }}>Confirme seu saque</Heading>
          <Text style={{ color: '#333', fontSize: '15px' }}>Olá, {name}! Use o código abaixo para confirmar o saque{amount ? ` de ${amount}` : ''}.</Text>
          <Text style={{ fontSize: '32px', fontWeight: 800, letterSpacing: '8px', color: '#f97316' }}>{code}</Text>
          <Text style={{ color: '#666', fontSize: '13px' }}>O código vale por 15 minutos. Se você não pediu este saque, ignore este e-mail e troque sua senha.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: WithdrawalCodeEmail,
  subject: 'Código para confirmar seu saque',
  displayName: 'Código de saque',
  previewData: { name: 'Maria', code: '123456', amount: 'R$ 250,00' },
} satisfies TemplateEntry
