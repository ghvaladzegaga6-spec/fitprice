#!/bin/bash
# ════════════════════════════════════════════
#  FITPRICE — Quick Start Script
#  Mac / Linux / Ubuntu
# ════════════════════════════════════════════

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}"
echo "╔══════════════════════════════════════╗"
echo "║      FITPRICE Quick Start v1.0       ║"
echo "╚══════════════════════════════════════╝"
echo -e "${NC}"

# Check Node
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js არ არის დაყენებული. https://nodejs.org${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js: $(node --version)${NC}"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3 არ არის დაყენებული. https://python.org${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Python: $(python3 --version)${NC}"

# Generate secrets if .env doesn't exist
if [ ! -f "backend/.env" ]; then
    echo -e "${YELLOW}⚙️  .env ფაილების შექმნა...${NC}"
    
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    JWT_REFRESH=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    INTERNAL=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    
    cat > backend/.env << EOF
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://fitprice_user:devpassword123@localhost:5432/fitprice_db
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH}
PYTHON_SERVICE_URL=http://localhost:8000
INTERNAL_TOKEN=${INTERNAL}
OPENAI_API_KEY=YOUR_OPENAI_KEY_HERE
ALLOWED_ORIGINS=http://localhost:3000
LOG_LEVEL=info
EOF
    
    cat > python-service/.env << EOF
ALLOWED_ORIGINS=http://localhost:3000
INTERNAL_TOKEN=${INTERNAL}
EOF
    
    echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > frontend/.env.local
    
    echo -e "${GREEN}✅ .env ფაილები შეიქმნა!${NC}"
    echo -e "${YELLOW}⚠️  backend/.env-ში შეცვალე OPENAI_API_KEY!${NC}"
fi

# Install dependencies
echo -e "\n${YELLOW}📦 Dependencies-ების ინსტალაცია...${NC}"

echo "  → Backend (Node.js)"
cd backend && npm install --silent && cd ..

echo "  → Frontend (Next.js)"
cd frontend && npm install --silent && cd ..

echo "  → Python Service"
cd python-service
python3 -m venv venv 2>/dev/null || true
source venv/bin/activate
pip install -r requirements.txt -q
deactivate
cd ..

echo -e "\n${GREEN}✅ ყველა პაკეტი დაყენებულია!${NC}"

echo -e "\n${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}🚀 გასაშვებად 3 ტერმინალი გჭირდება:${NC}"
echo ""
echo -e "${YELLOW}ტერმინალი 1 (Python):${NC}"
echo "  cd python-service && source venv/bin/activate && uvicorn main:app --reload --port 8000"
echo ""
echo -e "${YELLOW}ტერმინალი 2 (Backend):${NC}"
echo "  cd backend && npm run dev"
echo ""
echo -e "${YELLOW}ტერმინალი 3 (Frontend):${NC}"
echo "  cd frontend && npm run dev"
echo ""
echo -e "${GREEN}შემდეგ გახსენი: http://localhost:3000${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
