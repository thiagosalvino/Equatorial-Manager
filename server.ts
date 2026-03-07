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

let db: any;
try {
  const dbPath = process.env.DATABASE_URL || "invoices.db";
  const dbDir = path.dirname(dbPath);

  // Ensure the directory exists if it's not the current one
  if (dbDir !== "." && !fs.existsSync(dbDir)) {
    try {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`Created database directory: ${dbDir}`);
    } catch (err) {
      console.error(`Failed to create database directory ${dbDir}:`, err);
    }
  }

  console.log(`Initializing database at: ${dbPath}`);
  db = new Database(dbPath);
  // Initialize DB
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
  
  // Ensure items_detail column exists (for existing databases)
  try {
    db.exec("ALTER TABLE invoices ADD COLUMN items_detail TEXT");
  } catch (e) {
    // Column likely already exists
  }
  
  console.log("Database initialized successfully.");
} catch (err) {
  console.error("Failed to initialize database:", err);
  // Fallback to in-memory or just handle the error in routes
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Request logging middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  app.use(express.json());

  const upload = multer({ storage: multer.memoryStorage() });

  // API Routes - MOVED BEFORE VITE MIDDLEWARE
  app.get(["/api/ping", "/api/ping/"], (req, res) => {
    res.json({ status: "pong", timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
  });

  app.get(["/api/invoices", "/api/invoices/"], (req, res) => {
    console.log("Fetching invoices...");
    try {
      if (!db) {
        console.error("Database not initialized");
        return res.status(500).json({ error: "Banco de dados não inicializado no servidor." });
      }
      const invoices = db.prepare("SELECT * FROM invoices ORDER BY created_at DESC").all();
      // Parse items_detail if it exists
      const parsedInvoices = invoices.map((inv: any) => ({
        ...inv,
        items_detail: inv.items_detail ? JSON.parse(inv.items_detail) : []
      }));
      console.log(`Found ${parsedInvoices.length} invoices`);
      res.json(parsedInvoices);
    } catch (error: any) {
      console.error("Database error fetching invoices:", error);
      res.status(500).json({ error: "Erro ao acessar o banco de dados: " + error.message });
    }
  });

  app.post(["/api/upload", "/api/upload/"], upload.single("pdf"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado." });
      }

      let apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        if (process.env.CHAVE_TESTE && process.env.CHAVE_TESTE !== "") {
          apiKey = process.env.CHAVE_TESTE;
        }
      }
      
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        return res.status(500).json({ 
          error: "A chave API não foi encontrada. Por favor, configure GEMINI_API_KEY ou CHAVE_TESTE nos Secrets." 
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      const base64Data = req.file.buffer.toString("base64");

      const modelNames = ["gemini-3-flash-preview", "gemini-2.0-flash-exp", "gemini-1.5-flash"];
      let response;
      let lastError;

      for (const modelName of modelNames) {
        try {
          console.log(`Trying model: ${modelName}`);
          response = await ai.models.generateContent({
            model: modelName,
            contents: [
              {
                role: "user",
                parts: [
                  {
                    inlineData: {
                      data: base64Data,
                      mimeType: "application/pdf",
                    },
                  },
                  {
                    text: "Extraia os dados desta fatura Equatorial. Foque em: Unidade Consumidora (uc_number), Data de Vencimento (due_date), e o detalhamento de itens da fatura (descrição e valor). Retorne um JSON estruturado com os campos: customer_name, uc_number, reference_month, due_date, total_amount, energy_consumption e items_detail (array de objetos com description e value).",
                  },
                ],
              },
            ],
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
              },
            },
          });
          if (response) break;
        } catch (err: any) {
          console.error(`Model ${modelName} failed:`, err.message);
          lastError = err;
          if (err.message.includes("404")) continue;
          throw err; // If it's not a 404 (like a 429 or 503), we might want to stop or handle differently
        }
      }

      if (!response) throw lastError || new Error("Nenhum modelo disponível conseguiu processar a fatura.");

      const extractedText = response.text || "{}";
      console.log("Raw Gemini response:", extractedText);
      
      let extractedData;
      try {
        // Clean up markdown if present
        const cleanJson = extractedText.replace(/```json\n?|\n?```/g, "").trim();
        extractedData = JSON.parse(cleanJson);
      } catch (parseError) {
        console.error("Failed to parse Gemini response as JSON:", extractedText);
        throw new Error("A inteligência artificial retornou um formato inválido. Por favor, tente novamente.");
      }

      if (!db) throw new Error("Banco de dados não disponível.");

      const stmt = db.prepare(`
        INSERT INTO invoices (customer_name, uc_number, reference_month, due_date, total_amount, energy_consumption, items_detail, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        extractedData.customer_name || "Cliente não identificado",
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
      console.error("Error processing PDF:", error);
      let errorMessage = error.message;
      if (errorMessage.includes("429")) errorMessage = "Limite de uso atingido. Aguarde 1 minuto.";
      if (errorMessage.includes("503")) errorMessage = "Serviço temporariamente indisponível. Tente novamente em instantes.";
      res.status(500).json({ error: errorMessage });
    }
  });

  app.delete("/api/invoices/:id", (req, res) => {
    try {
      if (!db) throw new Error("Banco de dados não disponível.");
      const { id } = req.params;
      db.prepare("DELETE FROM invoices WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API 404 handler - ensures /api/* always returns JSON
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: `Rota de API não encontrada: ${req.method} ${req.originalUrl}` });
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
