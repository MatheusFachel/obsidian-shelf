# Brainstorm: próximos recursos do Shelf

Atualização posterior: as seis propostas foram implementadas na versão 0.2.0. O registro abaixo preserva a discussão original.

## Resumo da sessão

- Data: 2026-11-18.
- Objetivo: explorar capacidades que ampliem o Shelf como recorte prático de um vault grande e como galeria de referências.
- Base: recursos da versão 0.1.1 descritos no README e ideias que o usuário expressou nesta conversa.
- Técnica: perspectivas de uso e manutenção, seguidas de agrupamento e avaliação preliminar. As propostas abaixo não são decisões de produto.

## Ideias que iniciaram a discussão

- (user) "a ideia do Shelf é eu pegar uma instância dessa árvore e trabalhar dentro dela com mais facilidade visualmente"
- (user) "eu fico só usando o Notebook Navigator"
- (user) "visualização de inspiração, por exemplo, como se fosse um Pinterest"

## Perspectivas e propostas

- (AI: usuário de vault grande) **Mover para… no Shelf.** Ao reorganizar notas entre pastas já visíveis na prateleira, oferecer um comando contextual com busca do destino e confirmação. Um arrasto entre pastas poderia vir depois.
- (AI: curadoria visual) **Incluir subpastas na galeria, opcionalmente.** Reunir imagens de `Inspiração/cores`, `materiais` e `composição` em uma galeria, com indicação discreta da pasta de origem.
- (AI: curadoria visual) **Coleções de referências.** Selecionar imagens de várias pastas para um conjunto temporário de inspiração, guardando caminhos sem mover nem copiar arquivos.
- (AI: manutenção) **Adicionar a pasta da nota atual a uma shelf.** Um comando para vincular rapidamente o contexto aberto, respeitando a regra que impede raízes sobrepostas.
- (AI: pessoa que retoma um projeto) **Retomar o estado da shelf.** Guardar pastas expandidas e posição da árvore por shelf entre reinícios do Obsidian, para voltar ao mesmo ponto de trabalho.
- (AI: provocação) **Shelves por critérios, além de pastas.** Explorar uma shelf alimentada por tag, propriedade ou busca salva. Isso mudaria a proposta atual baseada em pastas; deve ser validado antes de qualquer implementação.

## Agrupamentos

- **Operar sem sair do Shelf:** mover itens; vincular a pasta da nota atual.
- **Curadoria visual:** incluir subpastas na galeria; coleções de referências.
- **Continuidade de trabalho:** retomar estado da árvore.
- **Expansão do conceito:** shelves por critérios.

## Avaliação preliminar

| Proposta | Objeção mais forte | O que a invalidaria | Menor validação |
| --- | --- | --- | --- |
| Mover para… | Um destino errado pode afetar links, anexos ou gerar conflito de nomes. | O fluxo não economizar passos frente ao explorador que o usuário já usa. | Protótipo por menu em vault de teste, movendo 10 notas entre duas pastas e conferindo links e conflitos. |
| Galeria com subpastas | Uma galeria grande pode perder o contexto de origem e ficar lenta. | O usuário preferir galerias separadas por pasta ao buscar referências reais. | Alternância em uma pasta de 2–3 níveis, com rótulo de origem; comparar tempo para achar três imagens. |
| Coleções visuais | Acrescenta uma segunda estrutura de organização para manter. | A coleção ser usada uma vez e abandonada. | Montar e revisitar um conjunto de 10 imagens de pastas diferentes sem duplicá-las. |
| Pasta da nota atual | Pode sugerir uma raiz que já está contida em outra. | O comando quase nunca ser usado em uma semana de trabalho. | Atalho experimental com bloqueio de sobreposição; contar usos e passos poupados. |
| Retomar estado | Persistir muitos caminhos pode gerar dados obsoletos após renomes. | O usuário preferir sempre começar com a árvore fechada. | Guardar estado de uma shelf e verificar a retomada após três reinícios e um rename. |
| Shelves por critérios | Introduz uma semântica diferente da árvore de pastas. | Os resultados dinâmicos não formarem um espaço de trabalho estável. | Esboço de interface e uma shelf piloto baseada em busca, sem mudar o modelo existente. |

## Categorias provisórias

- **Oportunidades imediatas:** adicionar a pasta da nota atual; retomar estado da árvore. São extensões pequenas da navegação já existente, sujeitas à validação do uso.
- **Funcionalidades futuras:** mover itens; galeria com subpastas; coleções visuais. Têm valor potencial alto, mas precisam de protótipos para definir interação, desempenho e tratamento de caminhos.
- **Exploração de longo prazo:** shelves por critérios. É uma mudança maior do modelo mental do plugin.
- **Aprendizado:** as propostas mais próximas da intenção original reduzem a necessidade de sair do Shelf ou de abrir várias pastas para concluir uma tarefa.

## Três escolhas e próximos passos

Ao encerrar esta discussão, as escolhas ainda não tinham sido feitas. Depois, o usuário pediu a implementação das seis propostas para testá-las.

## Estacionamento

- Arrastar arquivos entre pastas pode ser estudado depois de validar o comando explícito **Mover para…**.
- Uma galeria com subpastas precisará definir limite de profundidade, ordenação e indicação da origem.
