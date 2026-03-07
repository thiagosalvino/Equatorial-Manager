import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config();

// Global error handlers to prevent server crash
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Database initialization inside startServer
  let db: any;
  try {
    const dbPath = process.env.DATABASE_URL || "invoices.db";
    const dbDir = path.dirname(dbPath);

    if (dbDir !== "." && !fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`Created database directory: ${dbDir}`);
    }

    console.log(`Initializing database at: ${dbPath}`);
    db = new Database(dbPath);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT,
        uc_number TEXT,
        reference_month TEXT,
        due_date TEXT,
        total_amount REAL,
        energy_consumption REAL,
        items_detail TEXT,
        raw_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    try {
      db.exec("ALTER TABLE invoices ADD COLUMN items_detail TEXT");
    } catch (e) {}
    
    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("CRITICAL: Failed to initialize database:", err);
  }

  // Request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
    });
    next();
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const upload = multer({ storage: multer.memoryStorage() });

  // API Router
  const apiRouter = express.Router();

  apiRouter.get("/ping", (req, res) => {
    res.json({ 
      status: "pong", 
      timestamp: new Date().toISOString(), 
      env: process.env.NODE_ENV,
      db_ok: !!db 
    });
  });

  apiRouter.get("/invoices", (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ error: "Banco de dados não inicializado." });
      }
      const invoices = db.prepare("SELECT * FROM invoices ORDER BY created_at DESC").all();
      const parsedInvoices = invoices.map((inv: any) => ({
        ...inv,
        items_detail: inv.items_detail ? JSON.parse(inv.items_detail) : []
      }));
      res.json(parsedInvoices);
    } catch (error: any) {
      console.error("Database error:", error);
      res.status(500).json({ error: "Erro ao buscar faturas: " + error.message });
    }
  });

  apiRouter.post("/upload", upload.single("pdf"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado." });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "" || apiKey.includes("YOUR_API_KEY")) {
        return res.status(500).json({ error: "Configuração ausente: GEMINI_API_KEY não encontrada." });
      }

      const ai = new GoogleGenAI({ apiKey });
      const base64Data = req.file.buffer.toString("base64");

      const modelNames = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"];
      let response;
      let lastError: any;

      for (const modelName of modelNames) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: [{
              role: "user",
              parts: [
                { inlineData: { data: base64Data, mimeType: "application/pdf" } },
                { text: "Extraia os dados desta fatura Equatorial. Retorne JSON com: customer_name, uc_number, reference_month, due_date, total_amount, energy_consumption, items_detail (array de {description, value})." }
              ]
            }],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  customer_name: { type: Type.STRING },
                  uc_number: { type: Type.STRING },
                  reference_month: { type: Type.STRING },
                  due_date: { type: Type.STRING },
                  total_amount: { type: Type.NUMBER },
                  energy_consumption: { type: Type.NUMBER },
                  items_detail: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        description: { type: Type.STRING },
                        value: { type: Type.NUMBER }
                      },
                      required: ["description", "value"]
                    }
                  }
                },
                required: ["uc_number", "due_date", "items_detail"],
              }
            }
          });
          if (response) break;
        } catch (err: any) {
          lastError = err;
          if (err.message.includes("404") || err.message.includes("400")) continue;
          break;
        }
      }

      if (!response) {
        return res.status(500).json({ error: "Falha na IA: " + (lastError?.message || "Erro desconhecido") });
      }

      const cleanJson = (response.text || "{}").replace(/```json\n?|\n?```/g, "").trim();
      const extractedData = JSON.parse(cleanJson);

      if (!db) throw new Error("DB não disponível.");

      const stmt = db.prepare(`
        INSERT INTO invoices (customer_name, uc_number, reference_month, due_date, total_amount, energy_consumption, items_detail, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        extractedData.customer_name || "Cliente",
        extractedData.uc_number,
        extractedData.reference_month || "",
        extractedData.due_date,
        extractedData.total_amount || 0,
        extractedData.energy_consumption || 0,
        JSON.stringify(extractedData.items_detail || []),
        JSON.stringify(extractedData)
      );

      res.json({ id: result.lastInsertRowid, ...extractedData });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.delete("/invoices/:id", (req, res) => {
    try {
      if (!db) throw new Error("DB não disponível.");
      db.prepare("DELETE FROM invoices WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mount API router
  app.use("/api", apiRouter);

  // API 404 handler
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve("dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
