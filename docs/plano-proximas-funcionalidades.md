# Plano de possíveis funcionalidades do Shelf

Este documento registra as propostas originais e as decisões de desenho. As seis funcionalidades foram implementadas na versão 0.2.0. Os desenhos apresentados na conversa mostram a posição aproximada dos controles e não definem o visual final.

## Princípios para decidir

1. O Shelf continua sendo um recorte do vault: vincular não move nem copia arquivos.
2. Ações que alteram o vault devem usar os mecanismos do Obsidian e mostrar origem e destino antes de confirmar.
3. Pastas e arquivos continuam acessíveis por teclado e por menus, mesmo quando houver arrastar e soltar.
4. Recursos que exigem outra forma de organização devem ser opcionais e compreensíveis ao lado da árvore atual.

## 1. Mover notas e subpastas pelo Shelf

**Problema:** o Shelf permite criar, renomear e excluir, mas reorganizar arquivos entre pastas ainda exige outra árvore.

**Desenho:** no menu de contexto de um arquivo ou subpasta, **Mover para…** abre uma janela com origem, busca de destino e uma lista de pastas da shelf ativa. A última linha mostra o caminho completo resultante. O botão **Mover** só fica disponível para um destino válido.

**Fluxo:** selecionar arquivo → **Mover para…** → procurar pasta → conferir caminho → confirmar. Depois, o arquivo aparece no destino e o Shelf expande essa pasta. Um movimento de pasta segue o mesmo fluxo, mas impede destino igual a ela mesma ou a qualquer descendente.

**Implementação inicial:** usar as operações de movimentação do Obsidian, aproveitar os eventos de rename já observados pelo Shelf e tratar conflitos de nomes antes da ação. A primeira entrega seria por menu; arrastar entre pastas só seria considerado após validar o fluxo explícito.

**Pontos a decidir:** destinos apenas dentro da shelf ativa ou em todas as shelves; comportamento de anexos e links relativos; se permitir mover a raiz vinculada ou apenas itens dentro dela. A proposta inicial limita destinos à shelf ativa e não move a raiz vinculada por esse comando.

**Validação:** mover notas Markdown e subpastas em um vault de teste, incluindo nome duplicado, links para a nota e uma pasta com filhos. Confirmar que o usuário consegue concluir uma reorganização comum sem abrir o explorador nativo.

**Encaixe:** alto, pois completa a ideia de trabalhar na árvore recortada. **Complexidade:** média, com risco de alteração indesejada no vault; merece uma etapa própria.

## 2. Incluir subpastas na galeria

**Problema:** a galeria atual mostra somente imagens diretamente dentro da pasta aberta. Referências organizadas em vários níveis exigem abrir galerias separadas.

**Desenho:** no cabeçalho da galeria, um controle **Incluir subpastas** alterna entre o comportamento atual e uma visão agregada. Cada cartão mostra o nome da imagem e, discretamente, a subpasta de origem. A busca continua no cabeçalho; em modo agregado ela encontra imagens em todos os níveis incluídos.

**Fluxo:** abrir a galeria de `Inspiração` → ativar **Incluir subpastas** → percorrer imagens de `Cores`, `Materiais` e `Composição` → abrir uma imagem e, se necessário, localizar sua pasta original pelo cartão ou menu.

**Implementação inicial:** percorrer a árvore de `TFolder` a partir da pasta selecionada, manter apenas extensões de imagem e guardar a opção no estado da aba da galeria. Ao mudar uma imagem ou uma subpasta, atualizar os resultados. Em pastas grandes, renderizar os cartões progressivamente para evitar travamentos.

**Pontos a decidir:** profundidade ilimitada ou limite configurável; ordenação global por nome versus agrupamento por pasta; busca também pelo caminho. A proposta inicial usa profundidade ilimitada, agrupamento por pasta e busca por nome; o desempenho será medido antes de fixar limites.

**Validação:** usar uma pasta real de referências com dois ou três níveis e medir se três imagens são encontradas sem voltar à árvore. Repetir com centenas ou milhares de imagens para observar tempo de abertura, memória e fluidez.

**Encaixe:** alto para o uso de inspiração já descrito. **Complexidade:** média, principalmente por desempenho e atualização dos cartões.

## 3. Coleções visuais por referência

**Problema:** a pessoa pode querer reunir imagens de projetos diferentes em um moodboard sem mover nem duplicar os originais.

**Desenho:** abaixo das pastas de uma shelf aparece uma seção recolhível **Coleções**. Na galeria, o menu de uma imagem oferece **Adicionar à coleção…**. Selecionar uma coleção abre uma galeria de imagens escolhidas, com o caminho de origem em cada cartão.

**Fluxo:** criar coleção com nome → visitar galerias de diferentes pastas → adicionar imagens → abrir a coleção na shelf → remover uma referência sem excluir o arquivo original.

**Implementação inicial:** cada coleção pertence a uma shelf e guarda uma lista ordenada de caminhos de imagens, sem cópias. Renomes e movimentos atualizam esses caminhos. Se uma imagem for apagada, o cartão indica referência ausente e oferece removê-la; a coleção nunca apaga o arquivo original por acidente.

**Pontos a decidir:** coleção permanente ou temporária; permitir a mesma imagem em várias coleções; ordenação manual; se a coleção deve existir fora de uma shelf. A proposta inicial é permanente, pertence a uma shelf e admite referências repetidas em coleções diferentes.

**Validação:** montar uma coleção de dez imagens de ao menos três pastas e revisitá-la depois de alguns dias. O valor aparece se essa seleção reduzir buscas repetidas; se não for reutilizada, o novo conceito talvez não compense.

**Encaixe:** bom para curadoria visual, mas amplia o modelo de dados e a interface. **Complexidade:** média a alta.

## 4. Vincular a pasta da nota atual

**Problema:** quando uma nota já está aberta, buscar sua pasta em um seletor de um vault grande repete navegação que o Obsidian já resolveu.

**Desenho:** comando **Shelf: Adicionar pasta da nota atual à shelf**. Uma janela pequena mostra o caminho da pasta e a shelf de destino, com a shelf ativa selecionada. Se só houver uma shelf e o vínculo for válido, o comando pode adicioná-la diretamente, com uma notificação de confirmação.

**Fluxo:** abrir uma nota → executar o comando → escolher shelf, se necessário → confirmar → encontrar a pasta vinculada no Shelf.

**Implementação inicial:** ler o arquivo Markdown ativo, obter a pasta mãe, validar que existe e aplicar a regra atual de raízes sobrepostas. Se a pasta já estiver representada dentro de uma raiz vinculada, explicar isso em vez de criar uma duplicata. Uma nota na raiz do vault precisa de uma mensagem clara, pois vincular o vault inteiro contraria o objetivo de recorte.

**Validação:** usar o comando durante uma semana de trabalho e observar quantas vezes evita abrir o seletor de pastas. Testar nota sem pasta, nota já coberta por uma raiz e troca de shelf.

**Encaixe:** alto e diretamente ligado ao fluxo atual. **Complexidade:** baixa.

## 5. Retomar o estado de navegação

**Problema:** a árvore mantém pastas expandidas durante a vida da view, mas perde esse estado ao fechar e reabrir o Obsidian.

**Desenho:** nenhum controle novo é necessário no primeiro momento. Ao reabrir a shelf, aparecem as mesmas pastas expandidas e o último item em foco fica visível. A posição da barra lateral acompanha esse item, sem depender de um número de pixels que muda conforme a janela.

**Fluxo:** expandir pastas → trabalhar em uma nota → fechar o Obsidian → reabrir → continuar na mesma região da árvore. Cada shelf tem seu próprio estado.

**Implementação inicial:** guardar caminhos expandidos e último item por shelf, com gravação limitada por debounce. Ao carregar, validar caminhos existentes; renomes e exclusões atualizam ou descartam referências antigas. Guardar caminhos em vez de apenas posição de rolagem evita deslocamentos em telas diferentes.

**Pontos a decidir:** se o estado acompanha sincronização entre dispositivos ou fica somente no dispositivo atual. A proposta inicial trata isso como preferência local de interface, para evitar que uma tela altere o ponto de trabalho de outra.

**Validação:** três reinícios, troca entre duas shelves e um rename de pasta. Confirmar que a retomada é previsível e que o `data.json` não é regravado a cada tecla.

**Encaixe:** alto para vaults grandes. **Complexidade:** baixa a média, dependendo do local escolhido para persistir o estado.

## 6. Shelves por critérios

**Problema hipotético:** um projeto pode ter notas espalhadas pelo vault e reconhecíveis por tag ou propriedade, sem uma pasta mãe que sirva de recorte.

**Desenho:** na criação da shelf, escolher **Pastas** ou **Critério**. Uma shelf por critério informa, no cabeçalho, a regra usada, por exemplo `#projeto-alfa`, e mostra resultados agrupados por pasta de origem. As shelves de pastas existentes continuam como estão.

**Fluxo:** criar shelf por tag → escolher `#projeto-alfa` → ver as notas correspondentes → abrir uma nota → ao alterar a tag, a lista se atualiza.

**Implementação inicial:** protótipo somente leitura baseado nos metadados indexados pelo Obsidian. Não oferecer **Nova nota** diretamente em um conjunto dinâmico sem um destino explícito. Começar por uma única regra simples; combinações de tags, propriedades e busca livre ficam para uma possível fase posterior.

**Pontos a decidir:** se esse recurso ainda pertence ao Shelf ou cria um segundo tipo de navegador; como criar notas, ordenar resultados e explicar por que um arquivo entrou ou saiu da lista.

**Validação:** desenhar uma shelf real de projeto que hoje está espalhado em várias pastas. Se a lista continuar útil durante o trabalho e o usuário entender sua atualização, há motivo para implementar. Caso contrário, manter o foco nas shelves de pastas.

**Encaixe:** incerto até testar o uso; amplia bastante a proposta. **Complexidade:** alta.

## Sequência sugerida para experimentar

1. **Pasta da nota atual** e **retomar estado**: pequenos incrementos que verificam o valor da navegação contínua.
2. **Mover para…**: fecha a lacuna mais evidente da árvore, começando por uma ação explícita e testável.
3. **Galeria com subpastas**: expande uma capacidade já aprovada, com atenção a desempenho.
4. **Coleções visuais**: avançar somente se houver uso recorrente de conjuntos de inspiração.
5. **Shelves por critérios**: validar primeiro o modelo mental com protótipo, antes de alterar a estrutura de dados.

Essa sequência organiza experimentos e não aprova automaticamente nenhuma implementação.
