require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);
const mysql = require("mysql2/promise");

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
let db;

try {
    if (!process.env.MYSQL_URL) {
        throw new Error("MYSQL_URL is not set in environment variables");
    }

    const url = new URL(process.env.MYSQL_URL);

    db = mysql.createPool({
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
    console.error("❌ MYSQL CONNECTION ERROR:", err.message);
}

 
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
   SEND EMAIL CODE (FIXED — ONE CODE PER EMAIL)
===================================================== */
app.post("/send-code", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: "Email required" });

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 5 * 60 * 1000;

        await db.query(
            `INSERT INTO login_codes (email, code, expires_at)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
                code = VALUES(code),
                expires_at = VALUES(expires_at)`,
            [email, code, expiresAt]
        );

        await resend.emails.send({
            from: "La Mia Rosa <login@send.lamiarosa.store>",
            to: email,
            subject: "Your login code",
            html: `<h2>Your login code: ${code}</h2>`
        });

        res.json({ ok: true });
    } catch (err) {
        console.error("SEND CODE ERROR:", err);
        res.status(500).json({ error: "Mail error" });
    }
});

/* =====================================================
   VERIFY CODE + LOGIN / REGISTER
===================================================== */
app.post("/verify-code", async (req, res) => {
    const { email, code } = req.body;

    const [rows] = await db.query(
        "SELECT * FROM login_codes WHERE email = ? AND code = ?",
        [email, code]
    );

    if (!rows.length) return res.status(400).json({ error: "Invalid code" });

    if (Date.now() > rows[0].expires_at)
        return res.status(400).json({ error: "Code expired" });

    await db.query("DELETE FROM login_codes WHERE email = ?", [email]);

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
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ ok: true });
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
   GET USER ORDERS (NEW STRUCTURE)
===================================================== */
app.get("/orders", requireAuth, async (req, res) => {
    try {
        const [orders] = await db.query(
            `SELECT id, total, status, created_at
             FROM orders
             WHERE user_email = ?
             ORDER BY created_at DESC`,
            [req.user.email]
        );

        for (let order of orders) {
            const [items] = await db.query(
                `SELECT title, price, qty, image, size
                 FROM order_items
                 WHERE order_id = ?`,
                [order.id]
            );
            order.items = items;
        }

        res.json({ orders });

    } catch (err) {
        console.error("ORDERS FETCH ERROR", err);
        res.status(500).json({ error: "Failed to load orders" });
    }
});

/* =====================================================
   ORDER EMAIL TEMPLATE
===================================================== */
function orderEmailTemplate({ items, total }) {

  const itemsHtml = items.map(item => `
      <tr>
        <td style="padding:12px 0;">
          <img src="https://my-storee.onrender.com/${item.image.replace(/^\/?/, '')}"

               width="70" height="70"
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
  `).join("");

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

  return { html };
}


/* =====================================================
   CREATE PAYMENT — SAVE ORDER + ITEMS + EMAIL
===================================================== */
app.post("/create-payment", async (req, res) => {
    try {
        const { cart, total, email } = req.body;

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
                `INSERT INTO order_items (order_id, title, price, qty, image, size)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [orderId, item.title, item.price, item.qty, item.image, item.size || ""]
            );
        }

        const { html } = orderEmailTemplate({
            items: cart,
            total: numericTotal.toFixed(2)
        });

        await resend.emails.send({
            from: "La Mia Rosa <noreply@resend.dev>",
            to: email,
            subject: "Order confirmation – La Mia Rosa",
            html
        });

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
            from: "La Mia Rosa <noreply@resend.dev>",
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
            from: "La Mia Rosa <noreply@resend.dev>",
            to: "gogilchyn2005ilona@gmail.com",
            subject: "New message from Communication page",
            html: `
                <h2>New Customer Message</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Phone:</strong> ${phone}</p>
                <p><strong>Message:</strong><br/>${comment}</p>
            `
        });

        res.json({ success: true });

    } catch (err) {
        console.error("CONTACT ERROR:", err);
        res.status(500).json({ error: "Server error" });
    }
});


/* =====================================================
   GET PRODUCTS
===================================================== */
app.get("/products", (req, res) => {
    db.query("SELECT * FROM products ORDER BY id DESC", (err, rows) => {
        if (err) {
            console.error("PRODUCT FETCH ERROR", err);
            return res.status(500).json({ error: "Database error" });
        }

        res.json(rows);
    });
});

/* =====================================================
   START SERVER
===================================================== */
app.listen(PORT, () => {
    console.log("🚀 SERVER ON http://localhost:" + PORT);
});
