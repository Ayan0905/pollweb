# Classroom Poll (MongoDB + GitHub Pages)

Kaise kaam karta hai:

    Student/Admin (GitHub Pages)  ->  Server (Render)  ->  MongoDB Atlas

GitHub Pages sirf static files host karta hai aur browser se MongoDB seedha connect nahi ho sakta
(MongoDB ka Atlas Data API September 2025 me band ho chuka hai). Isliye beech me chhota server (server/ folder) chahiye.

## Folder
    index.html        -> student page par bhej deta hai
    student.html      -> students ke liye
    admin.html        -> teacher ke liye
    server/           -> backend (Render par chalega)
    .gitignore

## Step 1: MongoDB Atlas (free database)
1. mongodb.com/cloud/atlas par account banao.
2. "Create" -> Free (M0) cluster. Region apne paas ka chuno (jaise Mumbai).
3. Security -> Database Access -> Add New Database User. Username aur password likh lo
   (password me @ : / jaise special akshar mat rakho).
4. Security -> Network Access -> Add IP Address -> "Allow access from anywhere" (0.0.0.0/0). Confirm.
5. Database -> Connect -> Drivers -> connection string copy karo. Isme <password> ki jagah apna password likho.
   Ye aapka MONGODB_URI hai. Database aur collections server khud bana lega.

## Step 2 (optional): Apne computer par test
    cd server
    npm install
    (.env.example ko copy karke .env banao aur values bharo)
    npm start
student.html / admin.html me API_URL pehle se http://localhost:3000 hai, to wo chal jayega.

## Step 3: GitHub par upload
1. github.com par naya PUBLIC repository banao (free Pages ke liye public chahiye).
2. Is folder ki saari files upload karo (server folder ke saath). .env file kabhi upload mat karna.

## Step 4: Render par server
1. render.com par GitHub se login karo. New -> Web Service -> apna repo chuno.
2. Root Directory: server
   Build Command: npm install
   Start Command: npm start
   Instance Type: Free
3. Environment Variables:
   MONGODB_URI     = (Step 1 wala connection string)
   JWT_SECRET      = koi lamba random text (32+ akshar)
   ADMIN_PASSWORD  = admin ka pehla password
   FRONTEND_ORIGIN = https://AAPKA-USERNAME.github.io   (aage koi / ya repo ka naam nahi)
4. Deploy hone ke baad URL milega, jaise https://classroom-poll-xxxx.onrender.com
   Browser me /api/health khol ke check karo: {"ok":true} aana chahiye.

## Step 5: Frontend me server ka address
GitHub par student.html aur admin.html (dono) kholo -> pencil (Edit) -> file ke upar:
    const API_URL = "http://localhost:3000";
isko apne Render URL se badlo (end me / nahi) -> Commit.

## Step 6: GitHub Pages on karo
Repo -> Settings -> Pages -> Source: Deploy from a branch -> main, folder /(root) -> Save.
1-2 minute baad:
    Students: https://USERNAME.github.io/REPO-NAAM/student.html
    Admin:    https://USERNAME.github.io/REPO-NAAM/admin.html

## Dhyan rakho
- Render free server 15 minute use na hone par so jata hai; pehli request me 30-60 second lagte hain.
  Class se pehle student link ek baar khol lo.
- Admin link students ko mat do (password ke bina andar nahi ja sakte, par link chhupa ke rakho).
- MONGODB_URI, JWT_SECRET aur ADMIN_PASSWORD sirf Render me rakho, kabhi GitHub me nahi.
