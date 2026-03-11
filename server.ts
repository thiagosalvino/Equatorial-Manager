import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import multer from "multer";
import pdf from "pdf-parse-fork";
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
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Initialize DB
  db.exec(`
    CREATE TABLE IF NOT EXISTS classifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS borderos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classification_id INTEGER,
      reference_month TEXT,
      status TEXT DEFAULT 'aberto',
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (classification_id) REFERENCES classifications(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bordero_id INTEGER,
      customer_name TEXT,
      uc_number TEXT,
      address TEXT,
      reference_month TEXT,
      due_date TEXT,
      total_amount REAL,
      energy_consumption REAL,
      items_detail TEXT,
      raw_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bordero_id) REFERENCES borderos(id) ON DELETE CASCADE
    );
  `);
  
  // Ensure columns exist (for existing databases)
  try { db.exec("ALTER TABLE classifications ADD COLUMN code TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE borderos ADD COLUMN status TEXT DEFAULT 'aberto'"); } catch (e) {}
  try { db.exec("ALTER TABLE invoices ADD COLUMN address TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE invoices ADD COLUMN items_detail TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE invoices ADD COLUMN bordero_id INTEGER"); } catch (e) {}
  
  console.log("Database initialized successfully.");
} catch (err) {
  console.error("Failed to initialize database:", err);
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Request logging middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  app.use(express.json());

  const upload = multer({ storage: multer.memoryStorage() });

  // API Routes
  app.get(["/api/ping", "/api/ping/"], (req, res) => {
    res.json({ status: "pong", timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
  });

  // --- Classifications API ---
  app.get("/api/classifications", (req, res) => {
    try {
      const data = db.prepare("SELECT * FROM classifications ORDER BY name ASC").all();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/classifications", (req, res) => {
    try {
      const { code, name, status } = req.body;
      const result = db.prepare("INSERT INTO classifications (code, name, status) VALUES (?, ?, ?)").run(code, name, status || 'active');
      res.json({ id: result.lastInsertRowid });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/classifications/:id", (req, res) => {
    try {
      const { id } = req.params;
      const { code, name, status } = req.body;
      db.prepare("UPDATE classifications SET code = ?, name = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(code, name, status, id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/classifications/:id", (req, res) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM classifications WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Borderos API ---
  app.get("/api/borderos", (req, res) => {
    try {
      const data = db.prepare(`
        SELECT b.*, c.name as classification_name, c.code as classification_code
        FROM borderos b 
        LEFT JOIN classifications c ON b.classification_id = c.id 
        ORDER BY b.created_at DESC
      `).all();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/borderos", (req, res) => {
    try {
      const { classification_id, reference_month, created_by } = req.body;
      const result = db.prepare("INSERT INTO borderos (classification_id, reference_month, created_by, status) VALUES (?, ?, ?, 'aberto')")
        .run(classification_id, reference_month, created_by || 'Thiago Salvino');
      res.json({ id: result.lastInsertRowid });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/borderos/:id/finalize", (req, res) => {
    try {
      const { id } = req.params;
      db.prepare("UPDATE borderos SET status = 'finalizado', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/borderos/:id/reopen", (req, res) => {
    try {
      const { id } = req.params;
      db.prepare("UPDATE borderos SET status = 'importado', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/borderos/:id", (req, res) => {
    try {
      const { id } = req.params;
      const { classification_id, reference_month } = req.body;
      db.prepare("UPDATE borderos SET classification_id = ?, reference_month = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(classification_id, reference_month, id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/borderos/:id", (req, res) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM borderos WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/borderos/:id/invoices", (req, res) => {
    try {
      const { id } = req.params;
      const invoices = db.prepare("SELECT * FROM invoices WHERE bordero_id = ? ORDER BY created_at DESC").all(id);
      const parsedInvoices = invoices.map((inv: any) => ({
        ...inv,
        items_detail: inv.items_detail ? JSON.parse(inv.items_detail) : []
      }));
      res.json(parsedInvoices);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Invoices API ---
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

      const bordero_id = req.body.bordero_id;
      if (!bordero_id) {
        return res.status(400).json({ error: "O ID do borderô é obrigatório para a importação." });
      }

      // Check page count limit (Max 10 pages)
      try {
        const pdfData = await pdf(req.file.buffer);
        if (pdfData.numpages > 10) {
          return res.status(400).json({ 
            error: `Limite de páginas excedido. O arquivo possui ${pdfData.numpages} páginas, mas o limite máximo permitido para importação é de 10 páginas por arquivo.` 
          });
        }
      } catch (pdfError) {
        console.warn("Could not determine PDF page count, proceeding with upload:", pdfError);
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

      const modelNames = ["gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"];
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
                    text: "Este arquivo PDF pode conter múltiplas faturas (uma por página). Por favor, extraia os dados de TODAS as faturas presentes no arquivo (até 10 faturas). Para cada fatura, identifique: Unidade Consumidora (uc_number), Nome do Cliente (customer_name), Endereço Completo (address), Mês de Referência (reference_month), Data de Vencimento (due_date), Valor Total (total_amount), Consumo de Energia (energy_consumption) e o detalhamento de itens (items_detail). Retorne um ARRAY de objetos JSON, um para cada fatura encontrada.",
                  },
                ],
              },
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    customer_name: { type: Type.STRING, description: "Nome do cliente na fatura" },
                    uc_number: { type: Type.STRING, description: "Número da Unidade Consumidora" },
                    address: { type: Type.STRING, description: "Endereço completo da unidade" },
                    reference_month: { type: Type.STRING, description: "Mês de referência (ex: MAR/2026)" },
                    due_date: { type: Type.STRING, description: "Data de vencimento (ex: 15/03/2026)" },
                    total_amount: { type: Type.NUMBER, description: "Valor total da fatura em R$" },
                    energy_consumption: { type: Type.NUMBER, description: "Consumo total de energia em kWh" },
                    items_detail: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          description: { type: Type.STRING, description: "Descrição do item cobrado" },
                          value: { type: Type.NUMBER, description: "Valor do item em R$" }
                        },
                        required: ["description", "value"]
                      }
                    }
                  },
                  required: ["uc_number", "due_date", "items_detail"],
                }
              },
            },
          });
          if (response) break;
        } catch (err: any) {
          console.error(`Model ${modelName} failed:`, err.message || err);
          lastError = err;
          
          // Check if it's a rate limit or model not found error
          const errorStr = JSON.stringify(err).toLowerCase();
          const isRateLimit = errorStr.includes("429") || errorStr.includes("quota");
          const isNotFound = errorStr.includes("404") || errorStr.includes("not_found");
          
          if (isRateLimit || isNotFound) {
            console.log(`Model ${modelName} issue (Rate Limit/Not Found), trying next...`);
            continue;
          }
          throw err;
        }
      }

      if (!response) throw lastError || new Error("Nenhum modelo disponível conseguiu processar a fatura.");

      const extractedText = response.text || "[]";
      console.log("Raw Gemini response:", extractedText);
      
      let invoicesData: any[];
      try {
        // Clean up markdown if present
        const cleanJson = extractedText.replace(/```json\n?|\n?```/g, "").trim();
        invoicesData = JSON.parse(cleanJson);
        // Ensure it's an array even if Gemini returned a single object
        if (!Array.isArray(invoicesData)) {
          invoicesData = [invoicesData];
        }
      } catch (parseError) {
        console.error("Failed to parse Gemini response as JSON:", extractedText);
        throw new Error("A inteligência artificial retornou um formato inválido. Por favor, tente novamente.");
      }

      if (!db) throw new Error("Banco de dados não disponível.");

      const stmt = db.prepare(`
        INSERT INTO invoices (bordero_id, customer_name, uc_number, address, reference_month, due_date, total_amount, energy_consumption, items_detail, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertedIds = [];
      for (const data of invoicesData) {
        const result = stmt.run(
          bordero_id,
          data.customer_name || "Cliente não identificado",
          data.uc_number || "N/A",
          data.address || "",
          data.reference_month || "",
          data.due_date || "",
          data.total_amount || 0,
          data.energy_consumption || 0,
          JSON.stringify(data.items_detail || []),
          JSON.stringify(data)
        );
        insertedIds.push(result.lastInsertRowid);
      }

      // Update bordero status to 'importado' if it was 'aberto'
      db.prepare("UPDATE borderos SET status = 'importado', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'aberto'")
        .run(bordero_id);

      res.json({ success: true, count: insertedIds.length, ids: insertedIds });
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
      
      // Get bordero_id before deleting
      const invoice = db.prepare("SELECT bordero_id FROM invoices WHERE id = ?").get(id);
      
      if (invoice) {
        db.prepare("DELETE FROM invoices WHERE id = ?").run(id);
        
        // Check if there are any invoices left for this bordero
        const count = db.prepare("SELECT COUNT(*) as total FROM invoices WHERE bordero_id = ?").get(invoice.bordero_id);
        
        if (count.total === 0) {
          // Update status back to 'aberto' if no invoices left
          db.prepare("UPDATE borderos SET status = 'aberto', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'importado'")
            .run(invoice.bordero_id);
        }
      }
      
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
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
