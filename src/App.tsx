/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  FileText, 
  Upload, 
  Trash2, 
  Search, 
  Plus, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Calendar,
  User,
  Hash,
  Zap,
  DollarSign,
  ChevronRight,
  FileUp,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Invoice {
  id: number;
  customer_name: string;
  uc_number: string;
  reference_month: string;
  due_date: string;
  total_amount: number;
  energy_consumption: number;
  items_detail: { description: string; value: number }[];
  created_at: string;
}

export default function App() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoices = async (retryCount = 0) => {
    setLoading(true);
    setError(null);
    try {
      // First, check if the server is actually responding to API calls
      // Use cache-buster to ensure we're not getting a cached 404/503
      const pingRes = await fetch(`/api/ping?t=${Date.now()}`);
      if (!pingRes.ok) {
        throw new Error(`O servidor não está respondendo corretamente (Ping falhou: ${pingRes.status}).`);
      }

      const response = await fetch(`/api/invoices?t=${Date.now()}`);
      const contentType = response.headers.get("content-type");
      
      if (!response.ok) {
        let errorMessage = `Erro do servidor: ${response.status}`;
        if (contentType && contentType.includes("application/json")) {
          const errData = await response.json();
          errorMessage = errData.error || errorMessage;
        }
        throw new Error(errorMessage);
      }

      if (!contentType || !contentType.includes("application/json")) {
        // If we get HTML, maybe the server is still starting. Retry once after 2 seconds.
        if (retryCount < 1) {
          console.log("Got HTML instead of JSON, retrying in 2s...");
          await new Promise(r => setTimeout(r, 2000));
          return fetchInvoices(retryCount + 1);
        }
        throw new Error("O servidor retornou uma resposta inválida (HTML em vez de JSON). Isso acontece quando o servidor falha ao iniciar ou a rota não é encontrada. Por favor, clique no botão 'Recarregar' abaixo.");
      }
      
      const data = await response.json();
      setInvoices(data);
    } catch (err: any) {
      console.error("Fetch error:", err);
      setError('Falha ao carregar faturas: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const contentType = response.headers.get("content-type");
      if (!response.ok) {
        let errorMessage = 'Erro ao processar PDF';
        if (contentType && contentType.includes("application/json")) {
          const errData = await response.json();
          errorMessage = errData.error || errorMessage;
        } else {
          const text = await response.text();
          console.error("Server error (non-JSON):", text);
          errorMessage = `Erro do servidor (${response.status}). Verifique os logs do Railway.`;
        }
        throw new Error(errorMessage);
      }

      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("O servidor retornou uma resposta inválida durante o upload. Por favor, tente novamente em alguns segundos.");
      }

      await fetchInvoices();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
  });

  const deleteInvoice = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta fatura?')) return;
    try {
      await fetch('/api/invoices/' + id, { method: 'DELETE' });
      setInvoices(invoices.filter(inv => inv.id !== id));
      if (selectedInvoice?.id === id) setSelectedInvoice(null);
    } catch (err) {
      setError('Erro ao excluir fatura.');
    }
  };

  const filteredInvoices = invoices.filter(inv => 
    inv.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.uc_number.includes(searchTerm)
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500 p-2 rounded-lg">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">Equatorial Manager</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar por nome ou UC..." 
                className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:ring-2 focus:ring-emerald-500 w-64 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button 
              onClick={() => setSelectedInvoice(null)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Nova Fatura
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: List & Upload */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Upload Area */}
            <section>
              <div 
                {...getRootProps()} 
                className={cn(
                  "border-2 border-dashed rounded-2xl p-8 transition-all cursor-pointer flex flex-col items-center justify-center gap-4",
                  isDragActive ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-emerald-400 hover:bg-slate-50",
                  uploading && "pointer-events-none opacity-60"
                )}
              >
                <input {...getInputProps()} />
                <div className="bg-emerald-100 p-4 rounded-full">
                  {uploading ? (
                    <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                  ) : (
                    <FileUp className="w-8 h-8 text-emerald-600" />
                  )}
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-slate-700">
                    {uploading ? "Processando fatura..." : "Arraste sua fatura PDF aqui"}
                  </p>
                  <p className="text-sm text-slate-500">Ou clique para selecionar o arquivo</p>
                </div>
                {error && (
                  <div className="mt-4 p-6 bg-red-50 border border-red-100 rounded-2xl">
                    <div className="flex items-start gap-3 text-red-600 mb-4">
                      <AlertCircle className="w-5 h-5 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-bold">Houve um problema</p>
                        <p className="text-sm opacity-90">{error}</p>
                        <button 
                          onClick={() => fetchInvoices()}
                          className="mt-3 bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Tentar Novamente
                        </button>
                      </div>
                    </div>
                    
                    {error.includes("Secrets") && (
                      <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider">Como configurar:</p>
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col items-center gap-2 bg-slate-900 p-3 rounded-lg text-white">
                            <Hash className="w-5 h-5 opacity-50" />
                            <Search className="w-5 h-5 opacity-50" />
                            <div className="bg-emerald-500 p-2 rounded-md ring-4 ring-emerald-500/20">
                              <Zap className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-[8px] font-bold uppercase">Secrets</span>
                          </div>
                          <div className="text-sm text-slate-600">
                            <p>1. Clique no ícone de <span className="font-bold text-slate-900">Chave (Secrets)</span> no menu lateral esquerdo.</p>
                            <p>2. Adicione <span className="font-mono bg-slate-100 px-1 rounded text-emerald-600">GEMINI_API_KEY</span> como nome.</p>
                            <p>3. Cole sua chave e clique em salvar.</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Invoice List */}
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-bold text-slate-800">Faturas Recentes</h2>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  {filteredInvoices.length} faturas encontradas
                </span>
              </div>
              
              <div className="divide-y divide-slate-100">
                {loading ? (
                  <div className="p-12 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                    <p className="text-sm text-slate-500">Carregando faturas...</p>
                  </div>
                ) : filteredInvoices.length === 0 ? (
                  <div className="p-12 text-center text-slate-400">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>Nenhuma fatura encontrada.</p>
                  </div>
                ) : (
                  filteredInvoices.map((invoice) => (
                    <motion.div 
                      layout
                      key={invoice.id}
                      onClick={() => setSelectedInvoice(invoice)}
                      className={cn(
                        "p-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors group",
                        selectedInvoice?.id === invoice.id && "bg-emerald-50 border-l-4 border-l-emerald-500"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className="bg-slate-100 p-3 rounded-xl group-hover:bg-white transition-colors">
                          <FileText className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-800">{invoice.customer_name}</h3>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                            <span className="flex items-center gap-1">
                              <Hash className="w-3 h-3" /> {invoice.uc_number}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {invoice.reference_month}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="text-right hidden sm:block">
                          <p className="text-sm font-bold text-slate-900">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(invoice.total_amount)}
                          </p>
                          <p className="text-[10px] text-slate-400 uppercase font-bold">Vence em {invoice.due_date}</p>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteInvoice(invoice.id); }}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <ChevronRight className="w-5 h-5 text-slate-300" />
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* Right Column: Details */}
          <div className="lg:col-span-4">
            <AnimatePresence mode="wait">
              {selectedInvoice ? (
                <motion.div 
                  key="details"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden sticky top-24"
                >
                  <div className="bg-emerald-500 p-6 text-white">
                    <div className="flex justify-between items-start mb-4">
                      <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">Detalhes da Fatura</span>
                      <CheckCircle2 className="w-6 h-6 text-white/80" />
                    </div>
                    <h2 className="text-2xl font-bold mb-1">{selectedInvoice.customer_name}</h2>
                    <p className="text-emerald-100 text-sm opacity-80">UC: {selectedInvoice.uc_number}</p>
                  </div>

                  <div className="p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-4 rounded-2xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Unidade Consumidora</p>
                        <p className="font-mono text-slate-700">{selectedInvoice.uc_number}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-2xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Vencimento</p>
                        <p className="font-mono text-slate-700">{selectedInvoice.due_date}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Detalhamento de Itens</p>
                      <div className="border border-slate-100 rounded-xl overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                              <th className="text-left p-2 text-slate-500 font-semibold">Descrição</th>
                              <th className="text-right p-2 text-slate-500 font-semibold">Valor</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {selectedInvoice.items_detail && selectedInvoice.items_detail.length > 0 ? (
                              selectedInvoice.items_detail.map((item, idx) => (
                                <tr key={idx}>
                                  <td className="p-2 text-slate-600">{item.description}</td>
                                  <td className="p-2 text-right font-mono text-slate-700">
                                    R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={2} className="p-4 text-center text-slate-400 italic">Itens não detalhados</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-4 rounded-2xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Consumo</p>
                        <p className="text-lg font-bold text-slate-900">{selectedInvoice.energy_consumption} <span className="text-xs font-normal text-slate-500">kWh</span></p>
                      </div>
                      <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                        <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Valor Total</p>
                        <p className="text-lg font-bold text-emerald-700">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedInvoice.total_amount)}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                        <div className="bg-blue-100 p-2 rounded-lg">
                          <Calendar className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 font-medium">Data de Vencimento</p>
                          <p className="text-sm font-semibold text-slate-700">{selectedInvoice.due_date}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                        <div className="bg-purple-100 p-2 rounded-lg">
                          <Zap className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 font-medium">Mês de Referência</p>
                          <p className="text-sm font-semibold text-slate-700">{selectedInvoice.reference_month}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                        <div className="bg-amber-100 p-2 rounded-lg">
                          <User className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 font-medium">Titular da Conta</p>
                          <p className="text-sm font-semibold text-slate-700">{selectedInvoice.customer_name}</p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100">
                      <button 
                        className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                        onClick={() => window.print()}
                      >
                        <FileText className="w-4 h-4" />
                        Imprimir Relatório
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-slate-100 rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center sticky top-24"
                >
                  <div className="bg-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                    <ChevronRight className="w-8 h-8 text-slate-300" />
                  </div>
                  <h3 className="font-bold text-slate-600 mb-1">Nenhuma Seleção</h3>
                  <p className="text-sm text-slate-400">Selecione uma fatura na lista para ver os detalhes completos aqui.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-slate-200 mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 opacity-50">
            <Zap className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Equatorial Manager v1.0</span>
          </div>
          <p className="text-xs text-slate-400">© 2024 Sistema de Gestão de Faturas Inteligente</p>
        </div>
      </footer>
    </div>
  );
}
