# 🚀 FITPRICE — სრული გაშვების სახელმძღვანელო

## 📁 პროექტის სტრუქტურა

```
fitprice/
├── backend/          ← Node.js API (Express + TypeScript)
├── python-service/   ← FastAPI + Linear Programming
│   └── data/
│       └── products.csv   ← შენი Excel/CSV მონაცემები
├── frontend/         ← Next.js 14
└── docker/
    └── nginx/        ← Reverse Proxy
```

---

## ═══════════════════════════════════════
##  ნაბიჯი 1 — წინაპირობები (ლოკალური)
## ═══════════════════════════════════════

დააინსტალირე:
- Node.js 20+ → https://nodejs.org
- Python 3.12+ → https://python.org
- PostgreSQL 16+ → https://postgresql.org
- Docker Desktop → https://docker.com (production-ისთვის)

---

## ═══════════════════════════════════════
##  ნაბიჯი 2 — SECRET KEY-ების გენერაცია
## ═══════════════════════════════════════

**ტერმინალში გაუშვი ეს ბრძანებები და შეინახე შედეგები:**

```bash
# JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# JWT_REFRESH_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# INTERNAL_TOKEN
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## ═══════════════════════════════════════
##  ნაბიჯი 3 — .env ფაილების შექმნა
## ═══════════════════════════════════════

### 3.1 — Root .env (Docker-ისთვის)
```bash
cp .env.example .env
```
გახსენი `.env` და ჩასვი გენერირებული key-ები.

### 3.2 — Backend .env
```bash
cp backend/.env.example backend/.env
```
ჩასვი იგივე key-ები `backend/.env`-ში.

### 3.3 — Frontend .env.local
```bash
# ლოკალური გამოყენებისთვის:
echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > frontend/.env.local

# Production-ისთვის (Vercel):
# NEXT_PUBLIC_API_URL=https://your-backend-domain.com
```

---

## ═══════════════════════════════════════
##  ნაბიჯი 4 — ლოკალური გაშვება (dev)
## ═══════════════════════════════════════

### 4.1 — PostgreSQL (ლოკალურად)
```bash
# Mac:
brew install postgresql@16 && brew services start postgresql@16

# Ubuntu:
sudo apt install postgresql-16 && sudo systemctl start postgresql

# DB და user-ის შექმნა:
psql -U postgres -c "CREATE DATABASE fitprice_db;"
psql -U postgres -c "CREATE USER fitprice_user WITH PASSWORD 'yourpassword';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE fitprice_db TO fitprice_user;"
```

### 4.2 — Python Service
```bash
cd python-service
python -m venv venv

# Mac/Linux:
source venv/bin/activate

# Windows:
venv\Scripts\activate

pip install -r requirements.txt
cp .env.example .env   # შეავსე .env

uvicorn main:app --reload --port 8000
```
✅ მუშაობს: http://localhost:8000/health

### 4.3 — Node.js Backend
```bash
cd backend
npm install
cp .env.example .env   # შეავსე .env
npm run dev
```
✅ მუშაობს: http://localhost:4000/health

### 4.4 — Frontend
```bash
cd frontend
npm install
# .env.local უკვე შეიქმნა ზემოთ
npm run dev
```
✅ მუშაობს: http://localhost:3000

---

## ═══════════════════════════════════════
##  ნაბიჯი 5 — PRODUCTION გაშვება (Docker)
## ═══════════════════════════════════════

### 5.1 — სერვერი (Ubuntu 22.04)

```bash
# Docker ინსტალაცია
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Docker Compose
sudo apt install docker-compose-plugin

# პროექტის ატვირთვა სერვერზე
git clone https://github.com/yourusername/fitprice.git
cd fitprice

# .env ფაილის შექმნა
cp .env.example .env
nano .env   # შეავსე ყველა ველი!
```

### 5.2 — SSL სერტიფიკატი (Certbot)
```bash
sudo apt install certbot
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# სერტიფიკატების კოპირება:
sudo mkdir -p docker/nginx/ssl
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem docker/nginx/ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem docker/nginx/ssl/
sudo chmod 644 docker/nginx/ssl/*.pem
```

### 5.3 — nginx.conf-ში დომეინის შეცვლა
```bash
nano docker/nginx/nginx.conf
# შეცვალე: YOUR_DOMAIN.COM → yourdomain.com
```

### 5.4 — გაშვება
```bash
docker compose up -d --build

# ლოგების ნახვა:
docker compose logs -f

# სტატუსი:
docker compose ps
```

---

## ═══════════════════════════════════════
##  ნაბიჯი 6 — Frontend Vercel-ზე
## ═══════════════════════════════════════

```bash
# Vercel CLI
npm install -g vercel

cd frontend
vercel

# Environment variable Vercel dashboard-ში:
# NEXT_PUBLIC_API_URL = https://yourdomain.com
```

ან Vercel Dashboard-ზე:
1. "New Project" → GitHub repo → frontend folder
2. Settings → Environment Variables → `NEXT_PUBLIC_API_URL` = `https://yourdomain.com`
3. Deploy

---

## ═══════════════════════════════════════
##  ნაბიჯი 7 — Admin მომხმარებლის შექმნა
## ═══════════════════════════════════════

```bash
# Docker-ის შემდეგ:
docker exec -it fitprice_postgres psql -U fitprice_user -d fitprice_db

# PostgreSQL-ში:
UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
\q
```

---

## ═══════════════════════════════════════
##  ნაბიჯი 8 — პროდუქტების CSV განახლება
## ═══════════════════════════════════════

```bash
# ახალი CSV ატვირთვა:
cp new_products.csv python-service/data/products.csv

# Python service-ის რესტარტი:
docker compose restart python-service
```

---

## ═══════════════════════════════════════
##  🔐 უსაფრთხოების ჩეკლისტი
## ═══════════════════════════════════════

- [ ] .env ფაილი git-ში ნი ატვირთო (.gitignore-ში არის)
- [ ] JWT_SECRET მინიმუმ 64 ბაიტი
- [ ] POSTGRES_PASSWORD ძლიერი (20+ სიმბოლო)
- [ ] INTERNAL_TOKEN — მხოლოდ backend და python-service იცნობენ
- [ ] SSL სერტიფიკატი დაყენებული
- [ ] Nginx rate limiting ჩართული
- [ ] Python service-ი არასოდეს გამოქვეყნდება პირდაპირ (internal network)
- [ ] Firewall: მხოლოდ 80 და 443 პორტი გახსნილი

---

## ═══════════════════════════════════════
##  🛠 სასარგებლო ბრძანებები
## ═══════════════════════════════════════

```bash
# ყველა კონტეინერის სტოპი:
docker compose down

# ლოგები:
docker compose logs backend -f
docker compose logs python-service -f

# DB backup:
docker exec fitprice_postgres pg_dump -U fitprice_user fitprice_db > backup.sql

# DB restore:
cat backup.sql | docker exec -i fitprice_postgres psql -U fitprice_user fitprice_db

# SSL განახლება (Certbot auto-renew):
echo "0 12 * * * root certbot renew --quiet && docker compose restart nginx" | sudo tee /etc/cron.d/certbot
```

---

## ═══════════════════════════════════════
##  ❓ ხშირი პრობლემები
## ═══════════════════════════════════════

**Python service ვერ ტვირთავს CSV:**
```bash
ls -la python-service/data/products.csv   # ფაილი უნდა არსებობდეს
```

**Backend DB-ს ვერ უერთდება:**
```bash
# შეამოწმე DATABASE_URL backend/.env-ში
docker compose logs postgres   # DB ჯანმრთელია?
```

**CORS შეცდომა:**
```bash
# ALLOWED_ORIGINS-ში ჩასვი frontend-ის URL
# მაგ: ALLOWED_ORIGINS=https://fitprice.vercel.app
```

**OpenAI rate limit:**
- GPT-4o-mini გამოიყენება — ყველაზე იაფი
- Billing: https://platform.openai.com/billing
