# Teste das seis funcionalidades novas

Use um vault de teste com a versão 0.2.0 antes de instalar em um vault com notas importantes.

## Preparação

1. Na pasta do projeto, execute `npm run build`.
2. Recarregue o plugin no Obsidian ou reinicie o aplicativo. Confirme que o Shelf abre e que suas shelves antigas continuam com as pastas vinculadas.
3. Para os testes de mover e excluir, use notas, pastas e imagens descartáveis dentro do vault de desenvolvimento.

## 1. Vincular a pasta da nota atual

1. Abra uma nota Markdown em uma pasta que ainda não apareça na shelf.
2. Execute **Shelf: Add current note folder** pela paleta de comandos.
3. Se houver mais de uma shelf de pastas, escolha uma. A pasta da nota deve aparecer como raiz vinculada.
4. Execute o comando de novo na mesma nota. Ele deve avisar que a pasta já está representada, sem duplicá-la.
5. Repita com uma nota em uma subpasta de uma raiz já vinculada; também não deve surgir uma segunda raiz sobreposta.

## 2. Mover notas e subpastas

1. Em uma shelf de pastas, prepare duas pastas de destino e uma nota descartável em uma delas.
2. Clique com o botão direito na nota e selecione **Move to…**. Escolha a outra pasta, confira os caminhos de origem e destino e confirme.
3. Verifique no Shelf e no explorador nativo que a nota foi movida uma única vez. Se houver links para ela, confirme que continuam apontando para a nota.
4. Repita com uma subpasta que contenha outra nota. A pasta e seus filhos devem aparecer no destino.
5. Tente um destino onde já existe um item com o mesmo nome. O Shelf deve recusar o movimento sem substituir o existente.
6. Confira que uma pasta não aparece como destino dela mesma nem de um descendente.

## 3. Galeria com subpastas

1. Em uma pasta vinculada, coloque uma imagem diretamente nela e outra em cada uma de duas subpastas.
2. Abra a galeria da pasta mãe. Com **Include subfolders** desligado, só a imagem direta deve aparecer.
3. Ative **Include subfolders**. As imagens das subpastas devem aparecer com sua pasta de origem sob o nome.
4. Busque uma imagem pelo nome, abra-a e navegue com as setas. Troque de aba e volte; a opção deve continuar ativa.
5. Renomeie uma subpasta ou uma imagem no Obsidian. A galeria deve atualizar os cartões sem mostrar notas Markdown.

## 4. Coleções visuais

1. Na seção **Collections** da shelf, selecione **+** e crie uma coleção.
2. Abra duas galerias de pastas diferentes. Pelo menu de uma imagem em cada galeria, escolha **Add to collection…** e selecione a coleção.
3. Abra a coleção pela sidebar. As duas imagens devem aparecer com seus caminhos de origem, sem terem sido movidas ou copiadas.
4. Renomeie uma das imagens e depois sua pasta mãe. A coleção deve continuar encontrando o arquivo pelo novo caminho.
5. Exclua uma imagem descartável. A coleção deve mostrar uma referência ausente com **Remove reference**; ao removê-la, os demais cartões permanecem.
6. Renomeie e exclua a coleção pelo menu de contexto. Os arquivos originais devem permanecer no vault.

## 5. Retomar a navegação

1. Expanda duas ou três pastas em uma shelf e deixe o foco em uma nota mais abaixo na árvore.
2. Troque de shelf e volte. A expansão e o ponto de navegação devem estar preservados para cada shelf.
3. Reinicie o Obsidian com a view do Shelf aberta. Ao voltar, as pastas devem aparecer expandidas e o último item deve ficar acessível pela navegação de teclado.
4. Renomeie uma das pastas expandidas, reinicie de novo e confirme que o caminho antigo não causa item quebrado na navegação.

## 6. Shelf por tag

1. Crie uma shelf nova e, em **Contents**, escolha **Notes with a tag**. Informe uma tag, por exemplo `#shelf-teste`.
2. Coloque a tag em duas notas Markdown de pastas diferentes. Elas devem aparecer agrupadas pelos caminhos de origem.
3. Remova a tag de uma nota. Após o cache de metadados atualizar, ela deve sair da shelf.
4. Edite a shelf para trocar a tag e confirme que a lista acompanha a nova regra.
5. Teste abrir, renomear e excluir uma nota descartável pela lista. A shelf por tag não deve mostrar controle para vincular pastas nem criar quick note sem destino.

## Anotações úteis

Para cada falha, registre qual shelf estava ativa, o caminho de origem e destino, a ação executada e o resultado esperado versus observado. Uma captura da tela ajuda nos problemas de interface. Não edite o `data.json` enquanto o Obsidian estiver gravando alterações.
