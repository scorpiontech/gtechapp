#!/bin/bash
set -euo pipefail

# ─── Cores ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

BRANCH="${1:-main}"
BUILD_DIR="/opt/gtech-app"

echo -e "${GREEN}🚀 Deploy GTech App${NC}"
echo "────────────────────────────"

# 1. Verificar se estamos no diretório correto
if [ ! -f "package.json" ]; then
  echo -e "${RED}❌ package.json não encontrado. Execute este script na raiz do projeto.${NC}"
  exit 1
fi

# 2. Verificar mudanças locais não commitadas
if ! git diff --quiet HEAD 2>/dev/null || ! git diff --cached --quiet HEAD 2>/dev/null; then
  echo -e "${RED}❌ Existem mudanças locais não commitadas!${NC}"
  echo ""
  echo -e "${YELLOW}Para resolver, execute:${NC}"
  echo "  git stash -u        # salvar mudanças temporariamente"
  echo "  git pull origin $BRANCH"
  echo "  git stash pop       # restaurar mudanças (opcional)"
  echo ""
  echo -e "${YELLOW}Ou descarte as mudanças:${NC}"
  echo "  git checkout -- ."
  echo "  git clean -fd"
  exit 1
fi

# 3. Verificar se há arquivos não rastreados
UNTRACKED=$(git ls-files --others --exclude-standard)
if [ -n "$UNTRACKED" ]; then
  echo -e "${YELLOW}⚠️  Arquivos não rastreados encontrados:${NC}"
  echo "$UNTRACKED"
  echo ""
  echo -e "${YELLOW}Remova-os ou adicione ao .gitignore antes de continuar.${NC}"
  exit 1
fi

# 4. Atualizar código
echo -e "${GREEN}📥 Puxando últimas alterações de origin/$BRANCH...${NC}"
git fetch origin "$BRANCH"

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
  echo -e "${YELLOW}ℹ️  Já está atualizado. Continuando build...${NC}"
else
  git pull origin "$BRANCH" --ff-only || {
    echo -e "${RED}❌ Falha no git pull (conflito de merge).${NC}"
    echo ""
    echo -e "${YELLOW}Para resolver:${NC}"
    echo "  git stash -u"
    echo "  git pull origin $BRANCH"
    echo "  git stash pop"
    exit 1
  }
fi

# 5. Instalar dependências
echo -e "${GREEN}📦 Instalando dependências...${NC}"
rm -rf node_modules
npm ci --legacy-peer-deps || {
  echo -e "${RED}❌ Falha ao instalar dependências.${NC}"
  echo ""
  echo -e "${YELLOW}Tente:${NC}"
  echo "  rm -rf node_modules package-lock.json"
  echo "  npm install --legacy-peer-deps"
  exit 1
}

# 6. Build
echo -e "${GREEN}🔨 Executando build...${NC}"
npm run build || {
  echo -e "${RED}❌ Build falhou!${NC}"
  echo ""
  echo -e "${YELLOW}Verifique os erros acima e corrija antes de tentar novamente.${NC}"
  exit 1
}

# 7. Copiar para diretório de produção (se configurado)
if [ -d "$BUILD_DIR" ]; then
  echo -e "${GREEN}📂 Copiando build para $BUILD_DIR...${NC}"
  rm -rf "$BUILD_DIR/dist"
  cp -r dist "$BUILD_DIR/"
  echo -e "${GREEN}✅ Arquivos copiados!${NC}"
fi

# 8. Reload Nginx (se disponível)
if command -v nginx &> /dev/null; then
  echo -e "${GREEN}🔄 Recarregando Nginx...${NC}"
  sudo nginx -t && sudo systemctl reload nginx || {
    echo -e "${RED}❌ Falha ao recarregar Nginx. Verifique a configuração.${NC}"
    exit 1
  }
fi

echo ""
echo -e "${GREEN}✅ Deploy concluído com sucesso!${NC}"
echo -e "Commit: $(git rev-parse --short HEAD)"
echo -e "Branch: $BRANCH"
echo -e "Data:   $(date '+%Y-%m-%d %H:%M:%S')"
