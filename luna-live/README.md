# Luna Live v0.1

Protótipo privado de uma agente virtual humanoide em formato de videochamada.

## O que já existe
- Interface mobile de videochamada.
- Voz em tempo real via OpenAI Realtime API + WebRTC.
- Avatar visual com animação de presença e reação ao áudio.
- Foto oficial da Luna + opção de trocar a referência localmente.
- Persona transparente: Luna é uma IA, não uma pessoa real.
- Backend mantém a chave da OpenAI fora do navegador.

## Variável obrigatória
OPENAI_API_KEY

Nunca coloque a chave no JavaScript do navegador.

## Rodar
npm install
npm start

## Próxima fase
1. Conectar avatar facial em streaming para lip-sync e microexpressões.
2. Adicionar memória persistente controlada pelo usuário.
3. Criar biblioteca oficial de referências visuais da Luna.
4. Adicionar ações/gestos e corpo inteiro.
5. Transformar em PWA/app Android.
