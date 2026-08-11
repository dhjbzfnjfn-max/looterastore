import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";


dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, "..");

const app = express();
app.use(cors());
app.use(express.json({ limit: "32kb" }));

const products = [
  { id:"ps5-game", category:"PlayStation 5", title:"Игра PS5 — под заказ", price:0, note:"Выберите игру и сообщите название" },
  { id:"ps5-preorder", category:"PlayStation 5", title:"Предзаказ игры PS5", price:0, note:"Цена подтверждается перед оплатой" },
  { id:"ps5-sub", category:"PlayStation 5", title:"Подписка / услуга PS5", price:0, note:"Цена подтверждается перед оплатой" },
  { id:"steam-game", category:"PC / Steam", title:"Игра Steam — под заказ", price:0, note:"Укажите название игры" },
  { id:"epic-game", category:"PC / Epic Games", title:"Игра Epic Games — под заказ", price:0, note:"Укажите название игры" },
  { id:"mobile-app", category:"Мобильные приложения", title:"Приложение / подписка", price:0, note:"Укажите приложение или подписку" },
  { id:"mobile-game", category:"Мобильные игры", title:"Донат / игровая валюта", price:0, note:"Укажите игру и нужный пакет" },
  { id:"mobile-pass", category:"Мобильные игры", title:"Battle Pass / пропуск", price:0, note:"Укажите игру и пропуск" }
];

const orders = new Map();

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

function encrypt(text) {
  const key = Buffer.from(env("ACCOUNT_DATA_KEY"), "base64");
  if (key.length !== 32) throw new Error("ACCOUNT_DATA_KEY must be 32 bytes base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map(x => x.toString("base64")).join(".");
}

async function telegramSend(text) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.ADMIN_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      chat_id: process.env.ADMIN_CHAT_ID,
      text,
      parse_mode:"HTML"
    })
  });
}

app.get("/api/products", (_req,res) => res.json(products));

app.post("/api/orders", async (req,res) => {
  try {
    const { telegramUser, productId, requestedItem, accountData, paymentMethod } = req.body;
    const product = products.find(p => p.id === productId);

    if (!product || !accountData || !requestedItem || !["transfer","yookassa"].includes(paymentMethod)) {
      return res.status(400).json({error:"Заполните все поля заказа."});
    }

    const id = "L-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    const order = {
      id,
      createdAt:new Date().toISOString(),
      status: paymentMethod === "transfer" ? "awaiting_payment" : "payment_setup",
      telegramUser: telegramUser || null,
      productId,
      productTitle:product.title,
      requestedItem,
      accountDataEncrypted:encrypt(accountData),
      paymentMethod
    };
    orders.set(id, order);

    const buyer = telegramUser?.username ? `@${telegramUser.username}` : (telegramUser?.first_name || "без username");
    await telegramSend(
      `🛒 <b>НОВЫЙ ЗАКАЗ ${id}</b>\n\n` +
      `🎮 <b>Категория:</b> ${product.category}\n` +
      `📦 <b>Услуга:</b> ${product.title}\n` +
      `🎯 <b>Что купить:</b> ${requestedItem}\n` +
      `💳 <b>Оплата:</b> ${paymentMethod === "yookassa" ? "ЮKassa" : "Перевод"}\n` +
      `👤 <b>Покупатель:</b> ${buyer}\n\n` +
      `🔐 Данные аккаунта сохранены зашифрованно.\n` +
      `⚠️ Не пересылайте их в чаты и не храните в GitHub.`
    );

    // ЮKassa: здесь подключается создание платежа после того,
    // как в админке будет задана точная цена конкретного заказа.
    res.status(201).json({
      orderId:id,
      status:order.status,
      message: paymentMethod === "yookassa"
        ? "Заказ создан. После настройки цены будет создана ссылка ЮKassa."
        : "Заказ создан. Ожидается перевод."
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({error:"Ошибка сервера"});
  }
});

app.get("/api/health", (_req,res) => res.json({ok:true, service:"LOOTERA STORE"}));
app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "LOOTERA_STORE_V2.html"));
});
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`LOOTERA STORE backend listening on ${port}`));
