# Vistoria de Leilão: como colocar online

O site fica no **GitHub Pages** (gratuito) e usa o **Supabase** para login, banco de dados e fotos.
Só entra quem tiver e-mail e senha criados por você.

## 1. Criar o projeto no Supabase

1. Entre em supabase.com, clique em **New project** e escolha um nome, uma senha do banco (guarde) e a região **South America (São Paulo)**.
2. Quando o projeto terminar de carregar, abra **SQL Editor**, clique em **New query**, cole o conteúdo do arquivo `supabase/schema.sql` e clique em **Run**.
   Isso cria a tabela de cadastros, a pasta privada de fotos e as regras de acesso.

## 2. Cadastrar quem pode entrar

1. Em **Authentication**, desative a criação de novas contas (opção **Allow new users to sign up**, nas configurações de login). Sem isso, qualquer pessoa poderia se cadastrar.
2. Em **Authentication > Users**, clique em **Add user > Create new user**. Informe e-mail e senha, e marque **Auto Confirm User**. Repita para cada pessoa autorizada.
3. Para trocar a senha de alguém ou remover o acesso, use essa mesma tela.

## 3. Conectar o site ao Supabase

1. No Supabase, abra **Project Settings > API** (ou o botão **Connect**).
2. Copie o **Project URL** e a chave **anon** (também chamada *publishable*).
3. Cole os dois valores no arquivo `config.js`.
   Use somente a chave anon. Nunca use a chave `service_role` ou `secret`.

## 4. Publicar no GitHub

1. No GitHub, clique em **New repository**, dê um nome (por exemplo `vistoria-leilao`) e crie como **Public**. O GitHub Pages gratuito exige repositório público.
2. Clique em **uploading an existing file** e arraste os arquivos e a pasta deste projeto: `index.html`, `styles.css`, `app.js`, `config.js` e a pasta `supabase`. Clique em **Commit changes**.
3. Em **Settings > Pages**, em **Build and deployment**, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)**, e salve.
4. Em um ou dois minutos o endereço aparece nessa mesma tela, no formato `https://SEU-USUARIO.github.io/vistoria-leilao/`.

O código do site fica público, mas os dados não. A chave anon é feita para ficar no site, e as regras de acesso do Supabase só liberam leitura e escrita para quem fez login.

## 5. Testar

1. Abra o endereço, entre com um usuário criado no passo 2.
2. Cadastre um veículo de exemplo com duas ou três fotos pelo celular.
3. Confira na aba **Cadastrados** e exclua o exemplo.

## Regras do sistema

- Qualquer usuário logado vê todos os cadastros e pode editar.
- Só quem fez o cadastro pode excluí-lo.
- O chassi não pode se repetir.
- As fotos ficam numa pasta privada e só aparecem para quem está logado.
