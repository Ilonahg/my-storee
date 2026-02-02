require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3001;

/* =====================================================
   FRONTEND FILES
===================================================== */
app.use(express.static(path.join(__dirname, "../")));


/* =====================================================
   STATIC FILES
===================================================== */
app.use("/images", express.static(path.join(__dirname, "../images")));

/* =====================================================
   SECRET
===================================================== */
const JWT_SECRET = process.env.JWT_SECRET;


/* =====================================================
   MIDDLEWARE
===================================================== */
app.use(express.json());
app.use(cookieParser());

app.use(cors({
    origin: [
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "https://my-storee.onrender.com"
    ],
    credentials: true
}));

/* =====================================================
   MYSQL DATABASE
===================================================== */
const mysql = require("mysql2/promise");

let db;

async function initDB() {
    try {
        const url = new URL(process.env.MYSQL_URL);

        db = await mysql.createPool({
            host: url.hostname,
            port: url.port,
            user: url.username,
            password: url.password,
            database: url.pathname.replace("/", ""),
            ssl: { rejectUnauthorized: false },
            waitForConnections: true,
            connectionLimit: 10
        });

        console.log("✅ MySQL connected");
    } catch (err) {
        console.error("❌ DB CONNECTION ERROR:", err);
    }
}

initDB();

/* =====================================================
   OTP STORE
===================================================== */
const otpStore = new Map();

/* =====================================================
   AUTH MIDDLEWARE
===================================================== */
function requireAuth(req, res, next) {
    const token = req.cookies.auth_token;
    if (!token) {
        return res.status(401).json({ error: "Not authenticated" });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload;
        next();
    } catch {
        return res.status(401).json({ error: "Invalid token" });
    }
}
/* =====================================================
   HOME PAGE
===================================================== */
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../index.html"));
});

/* =====================================================
   SEND EMAIL CODE (RESEND API — WORKS ON RENDER)
===================================================== */
app.post("/send-code", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: "Email required" });

        const existing = otpStore.get(email);
        if (existing && Date.now() < existing.expiresAt) {
            return res.json({ ok: true });
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();

        otpStore.set(email, {
            code,
            expiresAt: Date.now() + 5 * 60 * 1000
        });

        await resend.emails.send({
            from: "La Mia Rosa <onboarding@resend.dev>",
            to: email,
            subject: "Your login code",
            html: `
                <div style="font-family:Arial;padding:20px">
                    <h2>Your login code</h2>
                    <p style="font-size:28px;font-weight:bold;letter-spacing:4px;">
                        ${code}
                    </p>
                    <p>This code expires in 5 minutes.</p>
                </div>
            `
        });

        res.json({ ok: true });

    } catch (err) {
        console.error("SEND CODE ERROR", err);
        res.status(500).json({ error: "Mail error" });
    }
});

/* =====================================================
   VERIFY CODE + LOGIN / REGISTER
===================================================== */
app.post("/verify-code", async (req, res) => {
    try {
        const { email, code } = req.body;
        const record = otpStore.get(email);

        if (!record) return res.status(400).json({ error: "Code not found" });
        if (Date.now() > record.expiresAt) return res.status(400).json({ error: "Code expired" });
        if (record.code !== code) return res.status(400).json({ error: "Invalid code" });

        otpStore.delete(email);

        const [users] = await db.query("SELECT id FROM users WHERE email = ?", [email]);

        let userId;

        if (users.length === 0) {
            const [result] = await db.query("INSERT INTO users (email) VALUES (?)", [email]);
            userId = result.insertId;
        } else {
            userId = users[0].id;
        }

        const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: "7d" });

        res.cookie("auth_token", token, {
            httpOnly: true,
            sameSite: "none",
            secure: true,
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({ ok: true });

    } catch (err) {
        console.error("VERIFY ERROR:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* =====================================================
   GET CURRENT USER
===================================================== */
app.get("/me", (req, res) => {
    const token = req.cookies.auth_token;
    if (!token) return res.json({ user: null });

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        res.json({
            user: {
                id: payload.userId,
                email: payload.email
            }
        });
    } catch {
        res.json({ user: null });
    }
});

/* =====================================================
   LOGOUT
===================================================== */
app.post("/logout", (req, res) => {
    res.clearCookie("auth_token");
    res.json({ ok: true });
});
 
/* =====================================================
   ORDER EMAIL TEMPLATE
===================================================== */
function orderEmailTemplate({ items, total }) {

  let attachments = [];

  const itemsHtml = items.map((item, index) => {

    const cid = `product${index}@lamia`;
    const imagePath = path.join(__dirname, "../", item.image);

    if (fs.existsSync(imagePath)) {
      attachments.push({
        filename: path.basename(imagePath),
        path: imagePath,
        cid
      });
    }

    return `
      <tr>
        <td style="padding:12px 0;">
          <img src="cid:${cid}" width="70" height="70"
            style="border-radius:8px; object-fit:cover;" />
        </td>
        <td style="padding:12px 10px; font-family:Arial;">
          <strong>${item.title}</strong><br/>
          Quantity: ${item.qty}
        </td>
        <td style="padding:12px 0; font-family:Arial; text-align:right;">
          ₺${(item.price * item.qty).toFixed(2)}
        </td>
      </tr>
    `;
  }).join("");

  const html = `
  <div style="background:#f5f5f5; padding:30px 0; font-family:Arial;">
    <div style="max-width:600px; margin:auto; background:#ffffff; border-radius:12px; overflow:hidden;">

      <div style="background:#111; color:#fff; padding:20px; text-align:center;">
        <h1 style="margin:0;">La Mia Rosa</h1>
      </div>

      <div style="padding:25px;">
        <h2>Thank you for your order 💖</h2>

        <table width="100%" cellspacing="0" cellpadding="0">
          ${itemsHtml}
        </table>

        <hr style="margin:20px 0; border:none; border-top:1px solid #eee;" />

        <table width="100%">
          <tr>
            <td>Total</td>
            <td style="text-align:right;"><strong>₺${total}</strong></td>
          </tr>
        </table>

        <div style="margin-top:25px; padding:15px; background:#fafafa; border-radius:8px;">
          <strong>Shipping information</strong>
          <p style="margin:8px 0 0;">
            Orders are delivered within <strong>5–7 business days</strong>.<br/>
            You will receive a tracking number once shipped.
          </p>
        </div>

      </div>
    </div>
  </div>
  `;

  return { html, attachments };
}

/* =====================================================
   CREATE PAYMENT — AUTO LINK TO USER BY EMAIL
===================================================== */
app.post("/create-payment", async (req, res) => {
    try {
        const { cart, total, email } = req.body;

        // 🔒 ПЕРЕВІРКА ДО БД
        if (!cart || !cart.length || !email) {
            return res.status(400).json({ error: "Invalid data" });
        }

        const numericTotal = Number(total.replace("₺", "").replace(",", ""));

        const [order] = await db.query(
            "INSERT INTO orders (user_email, total, status) VALUES (?, ?, ?)",
            [email, numericTotal, "paid"]
        );

        const orderId = order.insertId;

        for (const item of cart) {
            await db.query(
                "INSERT INTO order_items (order_id, title, price, qty, image, size) VALUES (?, ?, ?, ?, ?, ?)",
                [orderId, item.title, item.price, item.qty, item.image, item.size || ""]
            );
        }

        res.json({ ok: true, orderId });

    } catch (err) {
        console.error("PAYMENT ERROR:", err);
        res.status(500).json({ error: "Server error" });
    }
});


/* =====================================================
   TEST EMAIL
===================================================== */
app.get("/test-email", async (req, res) => {
    try {

        const { html } = orderEmailTemplate({
            items: [
                {
                    title: "Side-Zip Turtleneck Sweater",
                    price: 1249.90,
                    qty: 1,
                    image: "black-zip-cardigan-1.jpg"
                }
            ],
            total: "1249.90"
        });

        await resend.emails.send({
            from: "La Mia Rosa <onboarding@resend.dev>",
            to: "gogilchyn2005ilona@gmail.com",
            subject: "TEST ORDER EMAIL – La Mia Rosa",
            html: html
        });

        res.json({ ok: true });

    } catch (err) {
        console.error("TEST EMAIL ERROR:", err);
        res.status(500).json({ error: "Email failed" });
    }
});

/* =====================================================
   CONTACT FORM API
===================================================== */
app.post("/contact", async (req, res) => {
    try {
        const { name, email, phone, comment } = req.body;

        await db.query(
            "INSERT INTO messages (name, email, phone, comment) VALUES (?, ?, ?, ?)",
            [name || "", email, phone || "", comment]
        );

        await resend.emails.send({
            from: "La Mia Rosa <onboarding@resend.dev>",
            to: "gogilchyn2005ilona@gmail.com",
            subject: "New message",
            html: `<p>${comment}</p>`
        });

        res.json({ success: true });

    } catch (err) {
        console.error("CONTACT ERROR:", err);
        res.status(500).json({ error: "Server error" });
    }
});

 

/* =====================================================
   START SERVER
===================================================== */
app.listen(PORT, () => {
    console.log("🚀 SERVER ON http://localhost:" + PORT);
});
