# 🥗 FITPRICE

**ჭკვიანი კვების ბიუჯეტის კალკულატორი**

FITPRICE გიანგარიშებს ყველაზე **იაფ კვების კალათს**, რომელიც **ზუსტად** ემთხვევა შენს კალორიებს ან მაკრო-ელემენტებს. Linear Programming ალგორითმი + AI რეცეპტები + პროფესიონალური კვების გეგმა.

---

## ⚡ სწრაფი გაშვება

### Mac / Linux:
```bash
chmod +x start.sh && ./start.sh
```

### Windows:
```
start.bat (ორმაგი დაჭერა)
```

შემდეგ: **ტერმინალი 1** → Python · **ტერმინალი 2** → Backend · **ტერმინალი 3** → Frontend

გახსენი → **http://localhost:3000**

---

## 🛠 Tech Stack

| ნაწილი | ტექნოლოგია |
|--------|-----------|
| Frontend | Next.js 14 + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Algorithm | Python FastAPI + SciPy Linear Programming |
| Database | PostgreSQL |
| AI | OpenAI GPT-4o-mini |
| Auth | JWT + Refresh Tokens (httpOnly cookie) |
| Deploy | Docker Compose + Nginx |

---

## 🔑 გარე სერვისები

| სერვისი | რისთვის | ფასი |
|---------|---------|------|
| **OpenAI** | AI რეცეპტები | ~$0.01/მოთხოვნა |
| **Vercel** | Frontend hosting | უფასო |
| **Railway / AWS** | Backend + Python | $5-20/თვე |
| **Supabase** | PostgreSQL (ალტ.) | უფასო tier |

---

## 📖 სრული სახელმძღვანელო

იხილე → [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

---

## 🔐 Security Features

- JWT + Refresh Token rotation
- bcrypt(12) password hashing
- Rate limiting (auth: 10/15min, API: 300/15min)
- Helmet.js security headers
- CORS whitelist
- Input validation (Joi + Zod)
- Python service isolated (internal network only)
- Internal token auth between services
- Non-root Docker containers
- SQL injection protection (parameterized queries)

---

## 📊 პროდუქტების მონაცემთა ბაზა

`python-service/data/products.csv` — 1100+ ქართული სუპერმარკეტის პროდუქტი

CSV სვეტები:
```
product, protein, fat, carbs, calories, price,
sale_type, unit_weight, total_package_weight, is_promo, category
```

**განახლება:** შეცვალე CSV ფაილი → `docker compose restart python-service`

---

## 🗂 პროექტის სტრუქტურა

```
fitprice/
├── backend/                 ← Node.js API
│   └── src/
│       ├── auth/            ← JWT auth
│       ├── basket/          ← კალათი (Python proxy)
│       ├── nutrition/       ← კვება + AI რეცეპტი
│       ├── ads/             ← რეკლამები
│       ├── users/           ← მომხმარებლები
│       ├── middleware/      ← auth, errorHandler
│       └── db.ts            ← PostgreSQL + migrations
│
├── python-service/          ← FastAPI Algorithm Engine
│   ├── optimizer/basket.py  ← Linear Programming
│   ├── nutrition/engine.py  ← Mifflin-St Jeor + Macros
│   ├── data/loader.py       ← CSV reader
│   └── data/products.csv    ← შენი მონაცემები
│
├── frontend/                ← Next.js 14
│   └── src/
│       ├── app/
│       │   ├── basket/      ← კალათის გვერდი
│       │   ├── personalization/ ← კვების გეგმა
│       │   ├── auth/        ← login / register
│       │   ├── admin/       ← რეკლამების admin
│       │   └── profile/     ← პროფილი
│       ├── components/      ← UI კომპონენტები
│       ├── store/           ← Zustand state
│       └── lib/api.ts       ← Axios client
│
├── docker/nginx/nginx.conf  ← Reverse Proxy + SSL
├── docker-compose.yml       ← Production
├── docker-compose.dev.yml   ← Development
├── start.sh                 ← Mac/Linux quick start
├── start.bat                ← Windows quick start
└── docs/DEPLOYMENT.md       ← სრული სახელმძღვანელო
```
