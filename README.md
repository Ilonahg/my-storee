🌸 La Mia Rosa — Full-Stack Luxury E-Commerce Platform

Demo: https://my-storee.onrender.com

⚠️ The live server is hosted on Render’s free tier, so the first request may take 20–40 seconds due to cold start.

Repository: https://github.com/Ilonahg/my-storee

🧠 Project Overview

La Mia Rosa is a full-stack luxury fashion e-commerce platform designed with a strong focus on real store logic, UX engineering, and production-style architecture.

This project goes beyond UI — it implements authentication, order processing, email notifications, cart logic, and a structured backend.

🚀 Features
🛍 Store Functionality

Dynamic product pages

Variant selection (size/color)

Stock-aware UI

Cart merging identical variants

Checkout system

Order confirmation emails

👤 User System

JWT authentication

Login / Register

Email OTP login

Password reset

Account dashboard

Order history

💬 Communication

Contact form with DB storage

Email notifications

📱 UI/UX Systems

Responsive design

Desktop dropdown navigation

Mobile burger + slide menu

Scroll reveal animations

Smart search overlay

🖥 Tech Stack
Frontend

HTML5

CSS3

Vanilla JavaScript (modular UI logic)

Backend

Node.js

Express

MySQL

JWT authentication

bcrypt password hashing

Cookie-based sessions

Resend API (transactional emails)

🗄 Database Structure
Table	Purpose
users	Stores user accounts
orders	Stores orders
order_items	Products inside orders
login_codes	Email OTP login codes
messages	Contact form messages
🔐 Authentication Flow

Secure password hashing via bcrypt

JWT stored in HTTP-only cookies

Auth middleware protects private routes

Optional email OTP login

🛒 Order Flow

User adds products to cart

Checkout triggers /create-payment

Order stored in DB

Items stored separately

Confirmation email sent

Order appears in dashboard

📧 Email Integration

Powered by Resend API:

Order confirmations

Login OTP codes

Contact notifications

Custom HTML email template included.

📡 API Endpoints
Method	Endpoint	Description
GET	/products	Fetch products
POST	/register	Create account
POST	/login	Login
POST	/logout	Logout
GET	/me	Current user
POST	/send-code	Send OTP
POST	/verify-code	Verify OTP
POST	/reset-password	Reset password
GET	/orders	User orders
POST	/create-payment	Save order + email
POST	/contact	Contact form
🧩 Engineering Highlights

This project demonstrates:

✔ Full-stack architecture
✔ UI state management without frameworks
✔ Authentication & security logic
✔ Database modeling
✔ REST API design
✔ Responsive UI engineering
✔ Transactional email system

🛠 Local Setup
git clone https://github.com/Ilonahg/my-storee.git
cd my-storee
npm install


Create .env file:

MYSQL_URL=
JWT_SECRET=
RESEND_API_KEY=


Start server:

node server/server.js

💼 Portfolio Value

This project showcases the ability to build:

Real e-commerce systems

Backend-driven frontend logic

Secure authentication flows

Order processing pipelines

Email automation

Responsive UI systems

✨ Author

Developed by Ilona H.
